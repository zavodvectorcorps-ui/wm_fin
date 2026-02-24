import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Calendar } from '../components/ui/calendar';
import { 
  Plus, Calendar as CalendarIcon, List, ChevronLeft, ChevronRight
} from 'lucide-react';
import { formatCurrency, formatDate, getDirectionClass, getStatusClass, getStatusLabel, getRecurrenceLabel } from '../lib/utils';
import { toast } from 'sonner';

export const PlannedPaymentsPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [directions, setDirections] = useState([]);
  const [contractors, setContractors] = useState([]);
  
  const [view, setView] = useState('list');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    type: 'expense',
    amount: '',
    currency: 'PLN',
    category_id: '',
    contractor_id: '',
    direction_id: '',
    account_id: '',
    recurrence: 'none',
    comment: ''
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [paymentsRes, accountsRes, categoriesRes, directionsRes, contractorsRes] = await Promise.all([
        api().get('/planned-payments'),
        api().get('/accounts'),
        api().get('/categories'),
        api().get('/directions'),
        api().get('/contractors')
      ]);
      
      setPayments(paymentsRes.data);
      setAccounts(accountsRes.data);
      setCategories(categoriesRes.data);
      setDirections(directionsRes.data);
      setContractors(contractorsRes.data);
    } catch (error) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openNewPayment = () => {
    setFormData({
      date: new Date().toISOString().split('T')[0],
      type: 'expense',
      amount: '',
      currency: 'PLN',
      category_id: '',
      contractor_id: '',
      direction_id: directions[0]?.id || '',
      account_id: accounts[0]?.id || '',
      recurrence: 'none',
      comment: ''
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.amount || !formData.direction_id || !formData.account_id) {
      toast.error('Заполните обязательные поля');
      return;
    }

    try {
      await api().post('/planned-payments', {
        ...formData,
        amount: parseFloat(formData.amount)
      });
      toast.success('Платёж создан');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Ошибка сохранения');
    }
  };

  const updateStatus = async (id, status) => {
    try {
      await api().put(`/planned-payments/${id}/status?status=${status}`);
      toast.success('Статус обновлён');
      fetchData();
    } catch (error) {
      toast.error('Ошибка обновления');
    }
  };

  // Group payments by date for calendar
  const paymentsByDate = payments.reduce((acc, p) => {
    if (!acc[p.date]) acc[p.date] = [];
    acc[p.date].push(p);
    return acc;
  }, {});

  // Calculate forecast
  const forecast = accounts.map(account => {
    const accountPayments = payments.filter(p => p.account_id === account.id && p.status !== 'paid');
    const expectedIncome = accountPayments.filter(p => p.type === 'income').reduce((sum, p) => sum + p.amount, 0);
    const expectedExpense = accountPayments.filter(p => p.type === 'expense').reduce((sum, p) => sum + p.amount, 0);
    return {
      ...account,
      forecast: account.current_balance + expectedIncome - expectedExpense
    };
  });

  const filteredCategories = categories.filter(c => c.type === formData.type);

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Платёжный календарь</h1>
          <p className="text-muted-foreground">Планирование платежей и поступлений</p>
        </div>
        
        <div className="flex gap-2">
          <Tabs value={view} onValueChange={setView}>
            <TabsList>
              <TabsTrigger value="list" data-testid="view-list">
                <List className="h-4 w-4 mr-2" />
                Список
              </TabsTrigger>
              <TabsTrigger value="calendar" data-testid="view-calendar">
                <CalendarIcon className="h-4 w-4 mr-2" />
                Календарь
              </TabsTrigger>
            </TabsList>
          </Tabs>
          
          <Button onClick={openNewPayment} data-testid="add-payment-btn">
            <Plus className="h-4 w-4 mr-2" />
            Добавить
          </Button>
        </div>
      </div>

      {view === 'list' ? (
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-4">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : payments.length === 0 ? (
              <div className="p-12 text-center">
                <p className="text-muted-foreground mb-4">Нет запланированных платежей</p>
                <Button onClick={openNewPayment}>
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить платёж
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Дата</TableHead>
                    <TableHead>Тип</TableHead>
                    <TableHead>Сумма</TableHead>
                    <TableHead>Статья</TableHead>
                    <TableHead>Направление</TableHead>
                    <TableHead>Контрагент</TableHead>
                    <TableHead>Статус</TableHead>
                    <TableHead>Действия</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payments.map((p) => (
                    <TableRow key={p.id} className="table-row-hover" data-testid={`payment-row-${p.id}`}>
                      <TableCell className="font-mono">{formatDate(p.date)}</TableCell>
                      <TableCell>
                        <Badge variant={p.type === 'income' ? 'default' : 'destructive'}>
                          {p.type === 'income' ? 'Приход' : 'Расход'}
                        </Badge>
                      </TableCell>
                      <TableCell className={`font-mono font-semibold ${p.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {p.type === 'income' ? '+' : '-'}{formatCurrency(p.amount, p.currency)}
                      </TableCell>
                      <TableCell>{p.category_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getDirectionClass(p.direction_name)}>
                          {p.direction_name}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.contractor_name || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={getStatusClass(p.status)}>
                          {getStatusLabel(p.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select value={p.status} onValueChange={(v) => updateStatus(p.id, v)}>
                          <SelectTrigger className="w-32" data-testid={`status-select-${p.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pending">Ожидается</SelectItem>
                            <SelectItem value="paid">Оплачен</SelectItem>
                            <SelectItem value="postponed">Перенесён</SelectItem>
                            <SelectItem value="cancelled">Отменён</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Calendar */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>
                {calendarMonth.toLocaleDateString('ru', { month: 'long', year: 'numeric' })}
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon" onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(day => (
                  <div key={day} className="bg-muted p-2 text-center text-sm font-medium text-muted-foreground">
                    {day}
                  </div>
                ))}
                {(() => {
                  const year = calendarMonth.getFullYear();
                  const month = calendarMonth.getMonth();
                  const firstDay = new Date(year, month, 1).getDay();
                  const daysInMonth = new Date(year, month + 1, 0).getDate();
                  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
                  const cells = [];
                  
                  for (let i = 0; i < startOffset; i++) {
                    cells.push(<div key={`empty-${i}`} className="bg-background p-2 min-h-24" />);
                  }
                  
                  for (let day = 1; day <= daysInMonth; day++) {
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                    const dayPayments = paymentsByDate[dateStr] || [];
                    const incomeTotal = dayPayments.filter(p => p.type === 'income').reduce((s, p) => s + p.amount, 0);
                    const expenseTotal = dayPayments.filter(p => p.type === 'expense').reduce((s, p) => s + p.amount, 0);
                    
                    cells.push(
                      <div 
                        key={day} 
                        className="bg-background p-2 min-h-24 hover:bg-muted/50 cursor-pointer transition-colors"
                        onClick={() => setSelectedDate(new Date(year, month, day))}
                      >
                        <div className="text-sm font-medium mb-1">{day}</div>
                        {incomeTotal > 0 && (
                          <div className="text-xs text-emerald-500 font-mono truncate">
                            +{formatCurrency(incomeTotal)}
                          </div>
                        )}
                        {expenseTotal > 0 && (
                          <div className="text-xs text-rose-500 font-mono truncate">
                            -{formatCurrency(expenseTotal)}
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  return cells;
                })()}
              </div>
            </CardContent>
          </Card>

          {/* Forecast */}
          <Card>
            <CardHeader>
              <CardTitle>Прогноз остатков</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {forecast.map(account => (
                <div key={account.id} className="p-3 rounded-lg bg-muted/50">
                  <p className="font-medium">{account.name}</p>
                  <div className="flex justify-between mt-2">
                    <span className="text-sm text-muted-foreground">Текущий:</span>
                    <span className="font-mono">{formatCurrency(account.current_balance, account.currency)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Прогноз:</span>
                    <span className={`font-mono ${account.forecast < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {formatCurrency(account.forecast, account.currency)}
                    </span>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Add Payment Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Новый плановый платёж</DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Дата</Label>
                <Input 
                  type="date" 
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  data-testid="payment-form-date"
                />
              </div>
              <div className="space-y-2">
                <Label>Тип</Label>
                <Select value={formData.type} onValueChange={(v) => setFormData({ ...formData, type: v, category_id: '' })}>
                  <SelectTrigger data-testid="payment-form-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="income">Приход</SelectItem>
                    <SelectItem value="expense">Расход</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Сумма *</Label>
                <Input 
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  data-testid="payment-form-amount"
                />
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Статья</Label>
              <Select value={formData.category_id} onValueChange={(v) => setFormData({ ...formData, category_id: v })}>
                <SelectTrigger data-testid="payment-form-category">
                  <SelectValue placeholder="Выберите статью" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без категории</SelectItem>
                  {filteredCategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Направление *</Label>
                <Select value={formData.direction_id} onValueChange={(v) => setFormData({ ...formData, direction_id: v })}>
                  <SelectTrigger data-testid="payment-form-direction">
                    <SelectValue placeholder="Выберите" />
                  </SelectTrigger>
                  <SelectContent>
                    {directions.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Счёт *</Label>
                <Select value={formData.account_id} onValueChange={(v) => setFormData({ ...formData, account_id: v })}>
                  <SelectTrigger data-testid="payment-form-account">
                    <SelectValue placeholder="Выберите" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Контрагент</Label>
              <Select value={formData.contractor_id} onValueChange={(v) => setFormData({ ...formData, contractor_id: v })}>
                <SelectTrigger data-testid="payment-form-contractor">
                  <SelectValue placeholder="Выберите контрагента" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Без контрагента</SelectItem>
                  {contractors.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Повторяемость</Label>
              <Select value={formData.recurrence} onValueChange={(v) => setFormData({ ...formData, recurrence: v })}>
                <SelectTrigger data-testid="payment-form-recurrence">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Нет</SelectItem>
                  <SelectItem value="weekly">Еженедельно</SelectItem>
                  <SelectItem value="monthly">Ежемесячно</SelectItem>
                  <SelectItem value="quarterly">Ежеквартально</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Textarea 
                placeholder="Комментарий..."
                value={formData.comment}
                onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                data-testid="payment-form-comment"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSubmit} data-testid="payment-form-submit">Создать</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PlannedPaymentsPage;
