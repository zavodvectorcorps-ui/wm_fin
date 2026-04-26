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
import { Switch } from '../components/ui/switch';
import { Plus, Pencil, Trash2, RefreshCw, Repeat, Calendar } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { toast } from 'sonner';

const blankForm = {
  name: '',
  category_id: '',
  contractor_id: '',
  direction_id: '',
  account_id: '',
  amount: '',
  currency: 'PLN',
  periodicity: 'monthly',
  day_of_month: 1,
  is_active: true,
  comment: '',
};

export const RecurringExpensesPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [directions, setDirections] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [generating, setGenerating] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankForm);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [r, c, d, a, ct] = await Promise.all([
        api().get('/recurring-expenses'),
        api().get('/categories?type=expense'),
        api().get('/directions'),
        api().get('/accounts'),
        api().get('/contractors'),
      ]);
      setItems(r.data);
      setCategories(c.data);
      setDirections(d.data);
      setAccounts(a.data);
      setContractors(ct.data);
    } catch {
      toast.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openNew = () => {
    setEditing(null);
    setForm({
      ...blankForm,
      direction_id: directions[0]?.id || '',
      account_id: accounts[0]?.id || '',
    });
    setDialogOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      name: item.name,
      category_id: item.category_id || '',
      contractor_id: item.contractor_id || '',
      direction_id: item.direction_id,
      account_id: item.account_id,
      amount: String(item.amount),
      currency: item.currency,
      periodicity: item.periodicity,
      day_of_month: item.day_of_month,
      is_active: item.is_active,
      comment: item.comment || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name || !form.amount || !form.direction_id || !form.account_id) {
      toast.error('Заполните название, сумму, направление и счёт');
      return;
    }
    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      contractor_id: form.contractor_id || null,
      direction_id: form.direction_id,
      account_id: form.account_id,
      amount: parseFloat(String(form.amount).replace(',', '.')),
      currency: form.currency,
      periodicity: form.periodicity,
      day_of_month: parseInt(form.day_of_month, 10) || 1,
      is_active: form.is_active,
      comment: form.comment || null,
    };
    try {
      if (editing) {
        await api().put(`/recurring-expenses/${editing.id}`, payload);
        toast.success('Сохранено');
      } else {
        await api().post('/recurring-expenses', payload);
        toast.success('Создано');
      }
      setDialogOpen(false);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Удалить шаблон? Уже созданные плановые платежи останутся.')) return;
    try {
      await api().delete(`/recurring-expenses/${id}`);
      toast.success('Удалено');
      fetchData();
    } catch {
      toast.error('Ошибка');
    }
  };

  const generateNow = async () => {
    setGenerating(true);
    try {
      const res = await api().post('/recurring-expenses/generate-now');
      toast.success(`Создано плановых платежей: ${res.data.created} (из ${res.data.total_templates} активных шаблонов)`);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка');
    } finally {
      setGenerating(false);
    }
  };

  const totalMonthly = items
    .filter(i => i.is_active)
    .reduce((sum, i) => sum + (i.periodicity === 'quarterly' ? i.amount / 3 : i.amount), 0);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Repeat className="h-7 w-7 text-primary" />
            Регулярные расходы
          </h1>
          <p className="text-muted-foreground">Шаблоны постоянных платежей. Раз в день система создаёт плановые платежи на ближайший срок.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={generateNow} disabled={generating || items.length === 0} data-testid="generate-now-btn">
            <RefreshCw className={`h-4 w-4 mr-2 ${generating ? 'animate-spin' : ''}`} />
            Создать платежи сейчас
          </Button>
          <Button onClick={openNew} data-testid="add-recurring-btn">
            <Plus className="h-4 w-4 mr-2" />
            Добавить
          </Button>
        </div>
      </div>

      {!loading && items.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Всего шаблонов</p>
                <p className="text-2xl font-bold font-mono">{items.length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Активных</p>
                <p className="text-2xl font-bold font-mono">{items.filter(i => i.is_active).length}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Сумма / месяц (PLN)</p>
                <p className="text-2xl font-bold font-mono text-rose-500">{formatCurrency(totalMonthly)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Сумма / год (PLN)</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalMonthly * 12)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Шаблоны</CardTitle>
          <CardDescription>Аренда, абонплаты, налоги, подписки</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : items.length === 0 ? (
            <div className="text-center py-12">
              <Repeat className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground mb-3">Шаблонов ещё нет</p>
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Создать первый шаблон
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <div
                  key={item.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${item.is_active ? 'border-border bg-muted/30' : 'border-border/50 bg-muted/10 opacity-60'}`}
                  data-testid={`recurring-row-${item.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium">{item.name}</p>
                      <Badge variant="outline" className="text-xs">
                        <Calendar className="h-3 w-3 mr-1" />
                        {item.periodicity === 'monthly' ? `Каждый месяц, ${item.day_of_month}-го` : `Каждый квартал, ${item.day_of_month}-го`}
                      </Badge>
                      {!item.is_active && <Badge variant="outline" className="text-xs">Архив</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.category_name || '—'} · {item.direction_name} · {item.account_name}
                      {item.contractor_name && ` · ${item.contractor_name}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <p className="text-lg font-bold font-mono text-rose-500">
                      {formatCurrency(item.amount, item.currency)}
                    </p>
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => handleDelete(item.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Редактировать шаблон' : 'Новый регулярный расход'}</DialogTitle>
            <DialogDescription>Раз в день система создаст плановый платёж на ближайший срок</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Название *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Аренда склада, Интернет, Бухгалтер..."
                data-testid="recurring-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Сумма *</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                  placeholder="3500"
                  data-testid="recurring-amount"
                />
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Периодичность</Label>
                <Select value={form.periodicity} onValueChange={(v) => setForm({ ...form, periodicity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Ежемесячно</SelectItem>
                    <SelectItem value="quarterly">Ежеквартально</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>День месяца</Label>
                <Input
                  type="number"
                  min="1"
                  max="28"
                  value={form.day_of_month}
                  onChange={(e) => setForm({ ...form, day_of_month: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Статья (категория)</Label>
              <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
                <SelectTrigger><SelectValue placeholder="Выберите статью" /></SelectTrigger>
                <SelectContent>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Направление *</Label>
                <Select value={form.direction_id} onValueChange={(v) => setForm({ ...form, direction_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {directions.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Счёт *</Label>
                <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {accounts.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Контрагент</Label>
              <Select value={form.contractor_id} onValueChange={(v) => setForm({ ...form, contractor_id: v })}>
                <SelectTrigger><SelectValue placeholder="(не задан)" /></SelectTrigger>
                <SelectContent>
                  {contractors.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Input
                value={form.comment}
                onChange={(e) => setForm({ ...form, comment: e.target.value })}
                placeholder="Любые заметки"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Активен (создавать плановые платежи)</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} data-testid="save-recurring-btn">Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RecurringExpensesPage;
