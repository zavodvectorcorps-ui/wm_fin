import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';
import DescriptionAutocomplete from '../components/DescriptionAutocomplete';
import { Checkbox } from '../components/ui/checkbox';
import { 
  Plus, Minus, ArrowLeftRight, Search, Filter, Pencil, ArrowDownToLine, Bot, 
  Trash2, Calendar, MoreHorizontal, Paperclip, FileText, Link2, Unlink, AlertTriangle
} from 'lucide-react';
import { formatCurrency, formatDate, getDirectionClass, getStatusLabel, getPeriodDates, getTypeLabel } from '../lib/utils';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';

const sourceIcons = {
  manual: Pencil,
  import: ArrowDownToLine,
  telegram_bot: Bot
};

export const TransactionsPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [directions, setDirections] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [documents, setDocuments] = useState([]);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [transactionType, setTransactionType] = useState('expense');
  
  // Document linking state
  const [linkDocDialogOpen, setLinkDocDialogOpen] = useState(false);
  const [selectedTransactionForDoc, setSelectedTransactionForDoc] = useState(null);
  const [transactionDocuments, setTransactionDocuments] = useState({});
  
  const [filters, setFilters] = useState({
    period: 'current_month',
    type: 'all',
    status: 'all',
    account_id: 'all',
    direction_id: 'all',
    needs_review: 'all',
    search: ''
  });

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'expense',
    amount: '',
    currency: 'PLN',
    category_id: '',
    direction_id: '',
    account_id: '',
    to_account_id: '',
    contractor_id: '',
    description: '',
    status: 'fact',
    is_recurring: false
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dates = getPeriodDates(filters.period);
      const params = {
        date_from: dates.from,
        date_to: dates.to,
        ...(filters.type && filters.type !== 'all' && { type: filters.type }),
        ...(filters.status && filters.status !== 'all' && { status: filters.status }),
        ...(filters.account_id && filters.account_id !== 'all' && { account_id: filters.account_id }),
        ...(filters.direction_id && filters.direction_id !== 'all' && { direction_id: filters.direction_id }),
        ...(filters.needs_review && filters.needs_review !== 'all' && { needs_review: filters.needs_review === 'yes' }),
        ...(filters.search && { search: filters.search })
      };
      
      const [transRes, accountsRes, categoriesRes, directionsRes, contractorsRes, docsRes] = await Promise.all([
        api().get('/transactions', { params }),
        api().get('/accounts'),
        api().get('/categories'),
        api().get('/directions'),
        api().get('/contractors'),
        api().get('/documents', { params: { status: 'pending' } })
      ]);
      
      setTransactions(transRes.data);
      setAccounts(accountsRes.data);
      setCategories(categoriesRes.data);
      setDirections(directionsRes.data);
      setContractors(contractorsRes.data);
      setDocuments(docsRes.data);
    } catch (error) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [api, filters]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleNeedsReview = async (e, transactionId) => {
    e.stopPropagation();
    try {
      const res = await api().put(`/transactions/${transactionId}/review`);
      setTransactions(prev => prev.map(t => t.id === transactionId ? { ...t, needs_review: res.data.needs_review } : t));
    } catch {
      toast.error('Ошибка обновления');
    }
  };

  // Open document linking dialog
  const openLinkDocDialog = async (transaction) => {
    setSelectedTransactionForDoc(transaction);
    setLinkDocDialogOpen(true);
    
    // Fetch linked documents for this transaction
    try {
      const res = await api().get(`/transactions/${transaction.id}/documents`);
      setTransactionDocuments(prev => ({ ...prev, [transaction.id]: res.data }));
    } catch (error) {
      console.error('Error fetching transaction documents:', error);
    }
  };

  // Link document to transaction
  const linkDocument = async (documentId) => {
    if (!selectedTransactionForDoc) return;
    
    try {
      await api().post(`/documents/${documentId}/link-transaction?transaction_id=${selectedTransactionForDoc.id}`);
      toast.success('Документ прикреплён');
      
      // Refresh documents
      const res = await api().get(`/transactions/${selectedTransactionForDoc.id}/documents`);
      setTransactionDocuments(prev => ({ ...prev, [selectedTransactionForDoc.id]: res.data }));
      
      // Refresh pending documents list
      const docsRes = await api().get('/documents', { params: { status: 'pending' } });
      setDocuments(docsRes.data);
    } catch (error) {
      toast.error('Ошибка прикрепления документа');
    }
  };

  // Unlink document from transaction
  const unlinkDocument = async (documentId) => {
    if (!selectedTransactionForDoc) return;
    
    try {
      await api().delete(`/documents/${documentId}/unlink`);
      toast.success('Документ откреплён');
      
      // Refresh documents
      const res = await api().get(`/transactions/${selectedTransactionForDoc.id}/documents`);
      setTransactionDocuments(prev => ({ ...prev, [selectedTransactionForDoc.id]: res.data }));
      
      // Refresh pending documents list
      const docsRes = await api().get('/documents', { params: { status: 'pending' } });
      setDocuments(docsRes.data);
    } catch (error) {
      toast.error('Ошибка открепления документа');
    }
  };

  const openNewTransaction = (type) => {
    setTransactionType(type);
    setEditingTransaction(null);
    setFormData({
      date: new Date().toISOString().split('T')[0],
      type,
      amount: '',
      currency: 'PLN',
      category_id: '',
      direction_id: directions[0]?.id || '',
      account_id: accounts[0]?.id || '',
      to_account_id: '',
      contractor_id: '',
      description: '',
      status: 'fact',
      is_recurring: false
    });
    setDialogOpen(true);
  };

  const openEditTransaction = (transaction) => {
    setTransactionType(transaction.type);
    setEditingTransaction(transaction);
    setFormData({
      date: transaction.date,
      type: transaction.type,
      amount: transaction.amount.toString(),
      currency: transaction.currency,
      category_id: transaction.category_id || '',
      direction_id: transaction.direction_id,
      account_id: transaction.account_id,
      to_account_id: transaction.to_account_id || '',
      contractor_id: transaction.contractor_id || '',
      description: transaction.description || '',
      status: transaction.status,
      is_recurring: transaction.is_recurring
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.amount || !formData.direction_id || !formData.account_id) {
      toast.error('Заполните обязательные поля');
      return;
    }

    try {
      const payload = {
        ...formData,
        amount: parseFloat(formData.amount),
        category_id: formData.category_id === 'none' ? null : formData.category_id,
        contractor_id: formData.contractor_id === 'none' ? null : formData.contractor_id,
        to_account_id: formData.to_account_id || null
      };

      if (editingTransaction) {
        await api().put(`/transactions/${editingTransaction.id}`, payload);
        toast.success('Операция обновлена');
      } else {
        await api().post('/transactions', payload);
        toast.success('Операция создана');
      }
      
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api().delete(`/transactions/${id}`);
      toast.success('Операция удалена');
      fetchData();
    } catch (error) {
      toast.error('Ошибка удаления');
    }
  };

  const filteredCategories = categories.filter(c => 
    transactionType === 'transfer' ? true : c.type === transactionType
  );

  const SourceIcon = ({ source }) => {
    const Icon = sourceIcons[source] || Pencil;
    return <Icon className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Операции</h1>
          <p className="text-muted-foreground">Управление доходами и расходами</p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={() => openNewTransaction('income')} className="bg-emerald-600 hover:bg-emerald-700" data-testid="add-income-btn">
            <Plus className="h-4 w-4 mr-2" />
            Приход
          </Button>
          <Button onClick={() => openNewTransaction('expense')} variant="destructive" data-testid="add-expense-btn">
            <Minus className="h-4 w-4 mr-2" />
            Расход
          </Button>
          <Button onClick={() => openNewTransaction('transfer')} variant="outline" className="text-foreground border-border" data-testid="add-transfer-btn">
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Перевод
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
            <Select value={filters.period} onValueChange={(v) => setFilters({ ...filters, period: v })}>
              <SelectTrigger data-testid="filter-period">
                <Calendar className="h-4 w-4 mr-2" />
                <SelectValue placeholder="Период" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current_month">Текущий месяц</SelectItem>
                <SelectItem value="prev_month">Прошлый месяц</SelectItem>
                <SelectItem value="quarter">Квартал</SelectItem>
                <SelectItem value="year">Текущий год</SelectItem>
                <SelectItem value="year_2025">2025 год</SelectItem>
                <SelectItem value="year_2024">2024 год</SelectItem>
                <SelectItem value="year_2023">2023 год</SelectItem>
                <SelectItem value="all_time">Всё время</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
              <SelectTrigger data-testid="filter-type">
                <SelectValue placeholder="Тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="income">Приход</SelectItem>
                <SelectItem value="expense">Расход</SelectItem>
                <SelectItem value="transfer">Перевод</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.account_id} onValueChange={(v) => setFilters({ ...filters, account_id: v })}>
              <SelectTrigger data-testid="filter-account">
                <SelectValue placeholder="Счёт" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все счета</SelectItem>
                {accounts.map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.direction_id} onValueChange={(v) => setFilters({ ...filters, direction_id: v })}>
              <SelectTrigger data-testid="filter-direction">
                <SelectValue placeholder="Направление" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все направления</SelectItem>
                {directions.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
              <SelectTrigger data-testid="filter-status">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="fact">Факт</SelectItem>
                <SelectItem value="plan">План</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.needs_review} onValueChange={(v) => setFilters({ ...filters, needs_review: v })}>
              <SelectTrigger data-testid="filter-needs-review">
                <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                <SelectValue placeholder="Под вопросом" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="yes">Под вопросом</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Поиск..." 
                className="pl-9"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                data-testid="filter-search"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Period Summary */}
      {!loading && transactions.length > 0 && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4" data-testid="period-summary">
          <Card className="border-emerald-500/20">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">Доходы</p>
              <p className="text-lg font-bold font-mono text-emerald-500" data-testid="summary-income">
                +{formatCurrency(
                  transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0),
                  transactions[0]?.currency
                )}
              </p>
            </CardContent>
          </Card>
          <Card className="border-rose-500/20">
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">Расходы</p>
              <p className="text-lg font-bold font-mono text-rose-500" data-testid="summary-expense">
                -{formatCurrency(
                  transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
                  transactions[0]?.currency
                )}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">Баланс за период</p>
              {(() => {
                const inc = transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
                const exp = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
                const net = inc - exp;
                return (
                  <p className={`text-lg font-bold font-mono ${net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} data-testid="summary-net">
                    {net >= 0 ? '+' : ''}{formatCurrency(net, transactions[0]?.currency)}
                  </p>
                );
              })()}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-3 px-4">
              <p className="text-xs text-muted-foreground">Операций</p>
              <p className="text-lg font-bold font-mono" data-testid="summary-count">{transactions.length}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transactions Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-muted-foreground mb-4">Нет операций за выбранный период</p>
              <Button onClick={() => openNewTransaction('income')} data-testid="empty-add-btn">
                <Plus className="h-4 w-4 mr-2" />
                Добавить операцию
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Статья / Описание</TableHead>
                  <TableHead>Направление</TableHead>
                  <TableHead>Контрагент</TableHead>
                  <TableHead>Счёт</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow key={t.id} className="table-row-hover cursor-pointer" onClick={() => openEditTransaction(t)} data-testid={`transaction-row-${t.id}`}>
                    <TableCell>
                      <SourceIcon source={t.source} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatDate(t.date)}</TableCell>
                    <TableCell>
                      <span className={`font-mono font-semibold ${t.type === 'income' ? 'text-emerald-500' : t.type === 'expense' ? 'text-rose-500' : ''}`}>
                        {t.type === 'income' ? '+' : t.type === 'expense' ? '-' : ''}{formatCurrency(t.amount, t.currency)}
                      </span>
                      <p className="text-xs text-muted-foreground font-mono">
                        {formatCurrency(t.balance_after, t.currency)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div>
                          <p className="font-medium">{t.category_name || 'Без категории'}</p>
                          {t.description && <p className="text-sm text-muted-foreground truncate max-w-48">{t.description}</p>}
                        </div>
                        {t.needs_review && (
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" title="Под вопросом" />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getDirectionClass(t.direction_name)}>
                        {t.direction_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.contractor_name || '-'}</TableCell>
                    <TableCell>{t.account_name}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" data-testid={`transaction-menu-${t.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditTransaction(t); }}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openLinkDocDialog(t); }}>
                            <Paperclip className="h-4 w-4 mr-2" />
                            Документы
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => toggleNeedsReview(e, t.id)}>
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            {t.needs_review ? 'Снять отметку "Под вопросом"' : 'Отметить "Под вопросом"'}
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Удалить
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Удалить операцию?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Это действие нельзя отменить. Операция будет удалена навсегда.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(t.id)} data-testid="confirm-delete-btn">
                                  Удалить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Document Linking Dialog */}
      <Dialog open={linkDocDialogOpen} onOpenChange={setLinkDocDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Документы операции
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Linked documents */}
            {selectedTransactionForDoc && transactionDocuments[selectedTransactionForDoc.id]?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Прикреплённые документы
                </h4>
                <div className="space-y-2">
                  {transactionDocuments[selectedTransactionForDoc.id].map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate max-w-[200px]">{doc.file_name}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => unlinkDocument(doc.id)}
                        data-testid={`unlink-doc-${doc.id}`}
                      >
                        <Unlink className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Available documents to link */}
            {documents.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Доступные документы</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="truncate max-w-[200px] block">{doc.file_name}</span>
                          <span className="text-xs text-muted-foreground">{doc.type}</span>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => linkDocument(doc.id)}
                        data-testid={`link-doc-${doc.id}`}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        Прикрепить
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {documents.length === 0 && (!selectedTransactionForDoc || !transactionDocuments[selectedTransactionForDoc.id]?.length) && (
              <p className="text-muted-foreground text-center py-4">
                Нет доступных документов. Загрузите документы на странице "Документы".
              </p>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDocDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTransaction ? 'Редактировать операцию' : `Новый ${getTypeLabel(transactionType).toLowerCase()}`}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Дата</Label>
                <Input 
                  type="date" 
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  data-testid="form-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Сумма *</Label>
                <Input 
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  data-testid="form-amount"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger data-testid="form-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN (zł)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Счёт *</Label>
                <Select value={formData.account_id} onValueChange={(v) => setFormData({ ...formData, account_id: v })}>
                  <SelectTrigger data-testid="form-account">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {transactionType === 'transfer' && (
              <div className="space-y-2">
                <Label>На счёт</Label>
                <Select value={formData.to_account_id} onValueChange={(v) => setFormData({ ...formData, to_account_id: v })}>
                  <SelectTrigger data-testid="form-to-account">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(a => a.id !== formData.account_id).map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label>Статья</Label>
              <Select value={formData.category_id} onValueChange={(v) => setFormData({ ...formData, category_id: v })}>
                <SelectTrigger data-testid="form-category">
                  <SelectValue placeholder="Выберите статью" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без категории</SelectItem>
                  {filteredCategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.group} → {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Направление бизнеса *</Label>
              <Select value={formData.direction_id} onValueChange={(v) => setFormData({ ...formData, direction_id: v })}>
                <SelectTrigger data-testid="form-direction">
                  <SelectValue placeholder="Выберите направление" />
                </SelectTrigger>
                <SelectContent>
                  {directions.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Контрагент</Label>
              <Select value={formData.contractor_id} onValueChange={(v) => setFormData({ ...formData, contractor_id: v })}>
                <SelectTrigger data-testid="form-contractor">
                  <SelectValue placeholder="Выберите контрагента" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без контрагента</SelectItem>
                  {contractors.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Описание</Label>
              <DescriptionAutocomplete
                value={formData.description}
                onChange={(v) => setFormData({ ...formData, description: v })}
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="is-plan" 
                  checked={formData.status === 'plan'}
                  onCheckedChange={(checked) => setFormData({ ...formData, status: checked ? 'plan' : 'fact' })}
                  data-testid="form-is-plan"
                />
                <Label htmlFor="is-plan" className="text-sm">Плановая операция</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSubmit} data-testid="form-submit-btn">
              {editingTransaction ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TransactionsPage;
