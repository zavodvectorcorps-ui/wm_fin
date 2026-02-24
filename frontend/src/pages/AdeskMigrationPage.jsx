import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Checkbox } from '../components/ui/checkbox';
import { Progress } from '../components/ui/progress';
import { Alert, AlertDescription } from '../components/ui/alert';
import { 
  Upload, CheckCircle2, AlertTriangle, XCircle, Download, Trash2, 
  RefreshCw, Pencil, Check, Loader2, FileSpreadsheet, ArrowRight, Plug
} from 'lucide-react';
import { formatCurrency, formatDate } from '../lib/utils';
import { toast } from 'sonner';

export const AdeskMigrationPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  
  // Connection state
  const [apiToken, setApiToken] = useState('');
  const [connectionStatus, setConnectionStatus] = useState(null);
  const [transactionsCount, setTransactionsCount] = useState(0);
  
  // Migration settings
  const [dateFrom, setDateFrom] = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [migrateTransactions, setMigrateTransactions] = useState(true);
  const [migrateContractors, setMigrateContractors] = useState(true);
  const [migrateProjects, setMigrateProjects] = useState(true);
  const [migrateAccounts, setMigrateAccounts] = useState(true);
  const [migratePlanned, setMigratePlanned] = useState(false);
  
  // Drafts state
  const [drafts, setDrafts] = useState([]);
  const [stats, setStats] = useState({ total: 0, ready: 0, needs_review: 0, error: 0, imported: 0 });
  const [selectedDrafts, setSelectedDrafts] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [currentBatchId, setCurrentBatchId] = useState(null);
  
  // Edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingDraft, setEditingDraft] = useState(null);
  const [categories, setCategories] = useState([]);
  const [directions, setDirections] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [accounts, setAccounts] = useState([]);
  
  // Bulk edit dialog
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkDirection, setBulkDirection] = useState('');
  const [bulkContractor, setBulkContractor] = useState('');
  const [bulkAccount, setBulkAccount] = useState('');
  
  // Confirm dialog
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);

  const fetchDrafts = useCallback(async () => {
    try {
      const params = {};
      if (currentBatchId) params.batch_id = currentBatchId;
      if (statusFilter !== 'all') params.status = statusFilter;
      
      const res = await api().get('/adesk/drafts', { params });
      setDrafts(res.data.drafts);
      setStats(res.data.stats);
    } catch (error) {
      console.error('Error fetching drafts:', error);
    }
  }, [api, currentBatchId, statusFilter]);

  const fetchReferenceData = useCallback(async () => {
    try {
      const [catRes, dirRes, contrRes, accRes] = await Promise.all([
        api().get('/categories'),
        api().get('/directions'),
        api().get('/contractors'),
        api().get('/accounts')
      ]);
      setCategories(catRes.data);
      setDirections(dirRes.data);
      setContractors(contrRes.data);
      setAccounts(accRes.data);
    } catch (error) {
      console.error('Error fetching reference data:', error);
    }
  }, [api]);

  useEffect(() => {
    fetchDrafts();
    fetchReferenceData();
  }, [fetchDrafts, fetchReferenceData]);

  const testConnection = async () => {
    if (!apiToken.trim()) {
      toast.error('Введите API токен');
      return;
    }
    
    setLoading(true);
    try {
      const res = await api().post('/adesk/test-connection', { api_token: apiToken });
      setConnectionStatus(res.data.status);
      if (res.data.status === 'success') {
        setTransactionsCount(res.data.transactions_count);
        toast.success(`Подключение успешно! Найдено операций: ${res.data.transactions_count}`);
      } else {
        toast.error(res.data.message);
      }
    } catch (error) {
      toast.error('Ошибка подключения');
      setConnectionStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const startMigration = async () => {
    if (!apiToken.trim()) {
      toast.error('Введите API токен');
      return;
    }
    
    setLoading(true);
    try {
      const res = await api().post('/adesk/start-migration', {
        api_token: apiToken,
        date_from: dateFrom,
        date_to: dateTo,
        migrate_transactions: migrateTransactions,
        migrate_contractors: migrateContractors,
        migrate_projects: migrateProjects,
        migrate_accounts: migrateAccounts,
        migrate_planned: migratePlanned
      });
      
      if (res.data.status === 'success') {
        setCurrentBatchId(res.data.batch_id);
        toast.success(`Загружено ${res.data.drafts_created} операций в черновики`);
        fetchDrafts();
      }
    } catch (error) {
      toast.error('Ошибка миграции');
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (draft) => {
    setEditingDraft(draft);
    setEditDialogOpen(true);
  };

  const saveDraft = async () => {
    if (!editingDraft) return;
    
    try {
      await api().put(`/adesk/drafts/${editingDraft.id}`, {
        category_id: editingDraft.category_id,
        direction_id: editingDraft.direction_id,
        contractor_id: editingDraft.contractor_id,
        account_id: editingDraft.account_id,
        description: editingDraft.description
      });
      toast.success('Черновик обновлён');
      setEditDialogOpen(false);
      fetchDrafts();
    } catch (error) {
      toast.error('Ошибка сохранения');
    }
  };

  const bulkUpdate = async () => {
    if (selectedDrafts.length === 0) {
      toast.error('Выберите черновики');
      return;
    }
    
    try {
      await api().post('/adesk/drafts/bulk-update', {
        draft_ids: selectedDrafts,
        category_id: bulkCategory && bulkCategory !== '__none__' ? bulkCategory : undefined,
        direction_id: bulkDirection && bulkDirection !== '__none__' ? bulkDirection : undefined,
        contractor_id: bulkContractor && bulkContractor !== '__none__' ? bulkContractor : undefined,
        account_id: bulkAccount && bulkAccount !== '__none__' ? bulkAccount : undefined
      });
      toast.success(`Обновлено ${selectedDrafts.length} черновиков`);
      setBulkDialogOpen(false);
      setBulkCategory('');
      setBulkDirection('');
      setBulkContractor('');
      setBulkAccount('');
      setSelectedDrafts([]);
      fetchDrafts();
    } catch (error) {
      toast.error('Ошибка обновления');
    }
  };

  const confirmReady = async () => {
    setLoading(true);
    try {
      const res = await api().post('/adesk/confirm-ready', 
        currentBatchId ? { batch_id: currentBatchId } : {}
      );
      toast.success(`Импортировано: ${res.data.imported}, Дубликатов: ${res.data.duplicates}`);
      setConfirmDialogOpen(false);
      fetchDrafts();
    } catch (error) {
      toast.error('Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  const exportProblems = async () => {
    try {
      const res = await api().get('/adesk/export-problems', {
        params: currentBatchId ? { batch_id: currentBatchId } : {},
        responseType: 'blob'
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'adesk_problems.csv');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      toast.error('Ошибка экспорта');
    }
  };

  const deleteDraft = async (draftId) => {
    try {
      await api().delete(`/adesk/drafts/${draftId}`);
      toast.success('Черновик удалён');
      fetchDrafts();
    } catch (error) {
      toast.error('Ошибка удаления');
    }
  };

  const deleteAllDrafts = async () => {
    if (!confirm('Удалить ВСЕ черновики миграции? Это действие необратимо.')) return;
    setLoading(true);
    try {
      const res = await api().delete('/adesk/drafts/all');
      toast.success(`Удалено ${res.data.count} черновиков`);
      fetchDrafts();
    } catch (error) {
      toast.error('Ошибка удаления');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'ready':
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20"><CheckCircle2 className="h-3 w-3 mr-1" />Готово</Badge>;
      case 'needs_review':
        return <Badge className="bg-yellow-500/10 text-yellow-500 border-yellow-500/20"><AlertTriangle className="h-3 w-3 mr-1" />Проверка</Badge>;
      case 'error':
        return <Badge className="bg-rose-500/10 text-rose-500 border-rose-500/20"><XCircle className="h-3 w-3 mr-1" />Ошибка</Badge>;
      case 'imported':
        return <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20"><Check className="h-3 w-3 mr-1" />Импорт</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const toggleSelectAll = () => {
    if (selectedDrafts.length === drafts.length) {
      setSelectedDrafts([]);
    } else {
      setSelectedDrafts(drafts.map(d => d.id));
    }
  };

  const toggleSelect = (id) => {
    setSelectedDrafts(prev => 
      prev.includes(id) ? prev.filter(d => d !== id) : [...prev, id]
    );
  };

  const progressPercent = stats.total > 0 
    ? Math.round(((stats.ready + stats.imported) / stats.total) * 100) 
    : 0;

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Миграция из Adesk</h1>
        <p className="text-muted-foreground">Импорт данных из системы Adesk через API</p>
      </div>

      {/* Connection Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="h-5 w-5" />
            Подключение к Adesk
          </CardTitle>
          <CardDescription>Введите API-токен из настроек Adesk</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <Label>API-токен Adesk</Label>
              <Input 
                type="password"
                placeholder="Введите API-токен"
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
                data-testid="adesk-token-input"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={testConnection} disabled={loading} data-testid="test-connection-btn">
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plug className="h-4 w-4 mr-2" />}
                Проверить
              </Button>
            </div>
          </div>
          
          {connectionStatus === 'success' && (
            <Alert className="bg-emerald-500/10 border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              <AlertDescription className="text-emerald-500">
                Подключение успешно! Найдено операций: {transactionsCount}
              </AlertDescription>
            </Alert>
          )}
          
          {connectionStatus === 'error' && (
            <Alert className="bg-rose-500/10 border-rose-500/20">
              <XCircle className="h-4 w-4 text-rose-500" />
              <AlertDescription className="text-rose-500">
                Ошибка подключения. Проверьте токен.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Migration Settings */}
      {connectionStatus === 'success' && (
        <Card>
          <CardHeader>
            <CardTitle>Настройки миграции</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label>Дата от</Label>
                <Input 
                  type="date" 
                  value={dateFrom} 
                  onChange={(e) => setDateFrom(e.target.value)}
                  data-testid="date-from"
                />
              </div>
              <div>
                <Label>Дата до</Label>
                <Input 
                  type="date" 
                  value={dateTo} 
                  onChange={(e) => setDateTo(e.target.value)}
                  data-testid="date-to"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Что мигрировать:</Label>
              <div className="grid gap-2 md:grid-cols-3">
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="transactions" 
                    checked={migrateTransactions}
                    onCheckedChange={setMigrateTransactions}
                  />
                  <label htmlFor="transactions">Операции</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="contractors" 
                    checked={migrateContractors}
                    onCheckedChange={setMigrateContractors}
                  />
                  <label htmlFor="contractors">Контрагенты</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="projects" 
                    checked={migrateProjects}
                    onCheckedChange={setMigrateProjects}
                  />
                  <label htmlFor="projects">Проекты</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="accounts" 
                    checked={migrateAccounts}
                    onCheckedChange={setMigrateAccounts}
                  />
                  <label htmlFor="accounts">Счета</label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="planned" 
                    checked={migratePlanned}
                    onCheckedChange={setMigratePlanned}
                  />
                  <label htmlFor="planned">Плановые платежи</label>
                </div>
              </div>
            </div>
            
            <Button onClick={startMigration} disabled={loading} data-testid="start-migration-btn">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Загрузить данные в черновики
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Progress Panel */}
      {stats.total > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Миграция из Adesk: {stats.total} операций загружено</h3>
                <span className="text-sm text-muted-foreground">{progressPercent}% готово</span>
              </div>
              
              <Progress value={progressPercent} className="h-3" />
              
              <div className="flex flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <span>Готово: <strong>{stats.ready}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <span>Проверки: <strong>{stats.needs_review}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-rose-500" />
                  <span>Ошибки: <strong>{stats.error}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4 text-blue-500" />
                  <span>Импортировано: <strong>{stats.imported}</strong></span>
                </div>
              </div>
              
              <div className="flex gap-2">
                <Button 
                  onClick={() => setConfirmDialogOpen(true)} 
                  disabled={stats.ready === 0}
                  data-testid="confirm-all-btn"
                >
                  <Check className="h-4 w-4 mr-2" />
                  Подтвердить все готовые ({stats.ready})
                </Button>
                <Button variant="outline" onClick={exportProblems} data-testid="export-problems-btn">
                  <FileSpreadsheet className="h-4 w-4 mr-2" />
                  Экспорт проблемных
                </Button>
                <Button variant="destructive" onClick={deleteAllDrafts} disabled={loading} data-testid="delete-all-btn">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Удалить все
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Drafts Table */}
      {stats.total > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Черновики миграции</CardTitle>
              <div className="flex gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40" data-testid="status-filter">
                    <SelectValue placeholder="Статус" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все</SelectItem>
                    <SelectItem value="ready">Готово</SelectItem>
                    <SelectItem value="needs_review">Требует проверки</SelectItem>
                    <SelectItem value="error">Ошибки</SelectItem>
                  </SelectContent>
                </Select>
                
                {selectedDrafts.length > 0 && (
                  <Button variant="outline" onClick={() => setBulkDialogOpen(true)}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Редактировать ({selectedDrafts.length})
                  </Button>
                )}
                
                <Button variant="ghost" size="icon" onClick={fetchDrafts}>
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox 
                      checked={selectedDrafts.length === drafts.length && drafts.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Описание</TableHead>
                  <TableHead>Статья</TableHead>
                  <TableHead>Направление</TableHead>
                  <TableHead>Контрагент</TableHead>
                  <TableHead>Счёт</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead className="w-24"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((draft) => (
                  <TableRow key={draft.id} data-testid={`draft-row-${draft.id}`}>
                    <TableCell>
                      <Checkbox 
                        checked={selectedDrafts.includes(draft.id)}
                        onCheckedChange={() => toggleSelect(draft.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">{formatDate(draft.date)}</TableCell>
                    <TableCell>
                      <span className={`font-mono font-semibold ${draft.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {draft.type === 'income' ? '+' : '-'}{formatCurrency(draft.amount, draft.currency)}
                      </span>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm text-muted-foreground truncate max-w-40" title={draft.description}>
                        {draft.description || '-'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className={draft.category_name ? 'font-medium' : 'text-muted-foreground'}>
                          {draft.category_name || draft.category_adesk || '-'}
                        </p>
                        {draft.category_adesk && !draft.category_name && (
                          <p className="text-xs text-yellow-500">Adesk: {draft.category_adesk}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div>
                        <p className={draft.direction_name ? 'font-medium' : 'text-muted-foreground'}>
                          {draft.direction_name || '-'}
                        </p>
                        {draft.project_adesk && !draft.direction_name && (
                          <p className="text-xs text-yellow-500">Adesk: {draft.project_adesk}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className={draft.contractor_name ? '' : 'text-muted-foreground'}>
                        {draft.contractor_name || draft.contractor_adesk || '-'}
                      </p>
                    </TableCell>
                    <TableCell>
                      <p className={draft.account_name ? '' : 'text-muted-foreground'}>
                        {draft.account_name || draft.account_adesk || '-'}
                      </p>
                    </TableCell>
                    <TableCell>{getStatusBadge(draft.status)}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => openEditDialog(draft)}
                          data-testid={`edit-draft-${draft.id}`}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => deleteDraft(draft.id)}
                          data-testid={`delete-draft-${draft.id}`}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Редактировать черновик</DialogTitle>
            <DialogDescription>Исправьте маппинг для корректного импорта</DialogDescription>
          </DialogHeader>
          
          {editingDraft && (
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Дата</Label>
                  <p className="font-mono">{formatDate(editingDraft.date)}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Сумма</Label>
                  <p className={`font-mono font-semibold ${editingDraft.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {formatCurrency(editingDraft.amount, editingDraft.currency)}
                  </p>
                </div>
              </div>
              
              <div className="space-y-2">
                <Label>Категория</Label>
                {editingDraft.category_adesk && (
                  <p className="text-xs text-muted-foreground">Adesk: {editingDraft.category_adesk}</p>
                )}
                <Select 
                  value={editingDraft.category_id || ''} 
                  onValueChange={(v) => setEditingDraft({...editingDraft, category_id: v})}
                >
                  <SelectTrigger data-testid="edit-category">
                    <SelectValue placeholder="Выберите категорию" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => c.type === editingDraft.type).map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.group} → {c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Направление</Label>
                {editingDraft.project_adesk && (
                  <p className="text-xs text-muted-foreground">Adesk: {editingDraft.project_adesk}</p>
                )}
                <Select 
                  value={editingDraft.direction_id || ''} 
                  onValueChange={(v) => setEditingDraft({...editingDraft, direction_id: v})}
                >
                  <SelectTrigger data-testid="edit-direction">
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
                <Label>Счёт</Label>
                {editingDraft.account_adesk && (
                  <p className="text-xs text-muted-foreground">Adesk: {editingDraft.account_adesk}</p>
                )}
                <Select 
                  value={editingDraft.account_id || ''} 
                  onValueChange={(v) => setEditingDraft({...editingDraft, account_id: v})}
                >
                  <SelectTrigger data-testid="edit-account">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label>Контрагент</Label>
                <Select 
                  value={editingDraft.contractor_id || 'none'} 
                  onValueChange={(v) => setEditingDraft({...editingDraft, contractor_id: v === 'none' ? null : v})}
                >
                  <SelectTrigger data-testid="edit-contractor">
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
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Отмена</Button>
            <Button onClick={saveDraft} data-testid="save-draft-btn">Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Edit Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Массовое редактирование</DialogTitle>
            <DialogDescription>Выбрано {selectedDrafts.length} черновиков</DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Категория</Label>
              <Select value={bulkCategory} onValueChange={setBulkCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Не менять" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Не менять</SelectItem>
                  {categories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.type === 'income' ? '↑' : '↓'} {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Направление</Label>
              <Select value={bulkDirection} onValueChange={setBulkDirection}>
                <SelectTrigger>
                  <SelectValue placeholder="Не менять" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Не менять</SelectItem>
                  {directions.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Контрагент</Label>
              <Select value={bulkContractor} onValueChange={setBulkContractor}>
                <SelectTrigger>
                  <SelectValue placeholder="Не менять" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Не менять</SelectItem>
                  {contractors.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Счёт</Label>
              <Select value={bulkAccount} onValueChange={setBulkAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Не менять" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Не менять</SelectItem>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Отмена</Button>
            <Button onClick={bulkUpdate}>Применить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Подтвердить импорт?</DialogTitle>
            <DialogDescription>
              {stats.ready} готовых операций будут перенесены в рабочую базу. 
              Операции со статусом "Требует проверки" и "Ошибка" останутся в черновиках.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>Отмена</Button>
            <Button onClick={confirmReady} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
              Подтвердить
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdeskMigrationPage;
