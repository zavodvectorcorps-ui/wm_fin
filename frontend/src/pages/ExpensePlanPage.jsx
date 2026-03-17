import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Badge } from '../components/ui/badge';
import { Checkbox } from '../components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import {
  Plus, Trash2, Building2, Users, CreditCard, Copy,
  CalendarRange, Loader2, Pencil, Check, X
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const CATEGORIES = {
  rent: 'Аренда',
  salary: 'Зарплата',
  purchases: 'Закупки',
  utilities: 'Коммунальные',
  subscriptions: 'Подписки/Сервисы',
  other: 'Прочее'
};

const MONTH_NAMES = [
  '', 'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

const fmtMoney = (val, currency = 'PLN') => {
  const sym = { PLN: 'zł', EUR: '€', USD: '$' }[currency] || currency;
  return `${Number(val || 0).toLocaleString('pl-PL', { minimumFractionDigits: 2 })} ${sym}`;
};

const now = new Date();

export default function ExpensePlanPage() {
  const { api } = useAuth();

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [plan, setPlan] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [directions, setDirections] = useState([]);

  // Inline add state
  const [adding, setAdding] = useState(false);
  const [newItem, setNewItem] = useState({ type: 'variable', category: 'other', description: '', amount_planned: '', currency: 'PLN', day_in_month: '', is_recurring_every_month: false, project_id: null });

  // Inline edit state
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  // Extend dialog
  const [showExtend, setShowExtend] = useState(false);
  const [extendMonths, setExtendMonths] = useState(6);
  const [extending, setExtending] = useState(false);

  const fetchDirections = useCallback(async () => {
    try {
      const res = await api().get('/directions');
      setDirections(res.data || []);
    } catch {}
  }, [api]);

  const loadPlan = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api().get('/expense-plans', { params: { year, month } });
      const plans = res.data || [];
      if (plans.length > 0) {
        setPlan(plans[0]);
        const itemsRes = await api().get(`/expense-plans/${plans[0].id}/items`);
        setItems(itemsRes.data || []);
      } else {
        setPlan(null);
        setItems([]);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, [api, year, month]);

  useEffect(() => { fetchDirections(); }, [fetchDirections]);
  useEffect(() => { loadPlan(); }, [loadPlan]);

  const ensurePlan = async () => {
    if (plan) return plan;
    const res = await api().post(`/expense-plans?year=${year}&month=${month}`);
    setPlan(res.data);
    return res.data;
  };

  const addItem = async (overrides = {}) => {
    const p = await ensurePlan();
    const payload = { ...newItem, ...overrides };
    if (!payload.description && !overrides.description) { toast.error('Введите описание'); return; }
    if (!payload.amount_planned && !overrides.amount_planned) { toast.error('Введите сумму'); return; }
    payload.amount_planned = parseFloat(payload.amount_planned) || 0;
    payload.day_in_month = payload.day_in_month ? parseInt(payload.day_in_month) : null;

    try {
      await api().post(`/expense-plans/${p.id}/items`, payload);
      setNewItem({ type: 'variable', category: 'other', description: '', amount_planned: '', currency: 'PLN', day_in_month: '', is_recurring_every_month: false, project_id: null });
      setAdding(false);
      loadPlan();
      toast.success('Строка добавлена');
    } catch { toast.error('Ошибка добавления'); }
  };

  const quickAdd = (category, description, isRecurring = true) => {
    setAdding(true);
    setNewItem({
      type: isRecurring ? 'fixed' : 'variable',
      category,
      description,
      amount_planned: '',
      currency: 'PLN',
      day_in_month: '',
      is_recurring_every_month: isRecurring,
      project_id: null
    });
  };

  const deleteItem = async (id) => {
    try {
      await api().delete(`/expense-plans/items/${id}`);
      loadPlan();
      toast.success('Удалено');
    } catch { toast.error('Ошибка удаления'); }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setEditData({ ...item });
  };

  const saveEdit = async () => {
    try {
      await api().put(`/expense-plans/items/${editingId}`, {
        ...editData,
        amount_planned: parseFloat(editData.amount_planned) || 0,
        day_in_month: editData.day_in_month ? parseInt(editData.day_in_month) : null
      });
      setEditingId(null);
      loadPlan();
      toast.success('Сохранено');
    } catch { toast.error('Ошибка сохранения'); }
  };

  const copyPrevious = async () => {
    const p = await ensurePlan();
    try {
      const res = await api().post(`/expense-plans/${p.id}/copy-previous`);
      toast.success(`Скопировано ${res.data.copied} позиций`);
      loadPlan();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка копирования');
    }
  };

  const extendRecurring = async () => {
    if (!plan) return;
    setExtending(true);
    try {
      const res = await api().post(`/expense-plans/${plan.id}/extend-recurring?months_ahead=${extendMonths}`);
      toast.success(`Создано ${res.data.created_items} позиций в ${res.data.created_plans + extendMonths} месяцах`);
      setShowExtend(false);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка');
    } finally { setExtending(false); }
  };

  // Totals
  const fixedTotal = items.filter(i => i.type === 'fixed').reduce((s, i) => s + (i.amount_planned || 0), 0);
  const variableTotal = items.filter(i => i.type === 'variable').reduce((s, i) => s + (i.amount_planned || 0), 0);
  const grandTotal = fixedTotal + variableTotal;
  const recurringCount = items.filter(i => i.is_recurring_every_month).length;

  const dirName = (id) => directions.find(d => d.id === id)?.name || '';

  return (
    <div className="p-6 md:p-8 space-y-6" data-testid="expense-plan-page">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">План расходов</h1>
          <p className="text-muted-foreground">Планирование ежемесячных расходов</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-end">
        <div className="w-36">
          <Select value={String(month)} onValueChange={v => setMonth(Number(v))}>
            <SelectTrigger data-testid="select-month"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.slice(1).map((m, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-24">
          <Select value={String(year)} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger data-testid="select-year"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[2023, 2024, 2025, 2026, 2027].map(y => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={copyPrevious} data-testid="copy-prev-btn">
          <Copy className="h-4 w-4 mr-2" />Скопировать прошлый месяц
        </Button>
        {recurringCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => setShowExtend(true)} data-testid="extend-btn">
            <CalendarRange className="h-4 w-4 mr-2" />Протянуть постоянные ({recurringCount})
          </Button>
        )}
      </div>

      {/* Quick-add buttons */}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => quickAdd('rent', 'Аренда склада')} data-testid="quick-rent">
          <Building2 className="h-4 w-4 mr-1.5" />Аренда склада
        </Button>
        <Button variant="secondary" size="sm" onClick={() => quickAdd('salary', 'Зарплата сотрудника')} data-testid="quick-salary">
          <Users className="h-4 w-4 mr-1.5" />Зарплата сотрудника
        </Button>
        <Button variant="secondary" size="sm" onClick={() => quickAdd('subscriptions', 'Подписка/Сервис')} data-testid="quick-sub">
          <CreditCard className="h-4 w-4 mr-1.5" />Подписка/Сервис
        </Button>
        <Button variant="outline" size="sm" onClick={() => { setAdding(true); setNewItem({ type: 'variable', category: 'other', description: '', amount_planned: '', currency: 'PLN', day_in_month: '', is_recurring_every_month: false, project_id: null }); }} data-testid="add-custom-btn">
          <Plus className="h-4 w-4 mr-1.5" />Добавить строку
        </Button>
      </div>

      {/* Main Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Тип</TableHead>
                    <TableHead className="w-32">Категория</TableHead>
                    <TableHead>Описание</TableHead>
                    <TableHead className="w-32">Проект</TableHead>
                    <TableHead className="w-20 text-center">День</TableHead>
                    <TableHead className="w-36 text-right">Сумма</TableHead>
                    <TableHead className="w-20 text-center">Повт.</TableHead>
                    <TableHead className="w-20"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => (
                    editingId === item.id ? (
                      <TableRow key={item.id} className="bg-muted/30">
                        <TableCell>
                          <Select value={editData.type} onValueChange={v => setEditData({ ...editData, type: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="fixed">Постоянный</SelectItem>
                              <SelectItem value="variable">Переменный</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Select value={editData.category} onValueChange={v => setEditData({ ...editData, category: v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {Object.entries(CATEGORIES).map(([k, v]) => (
                                <SelectItem key={k} value={k}>{v}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input className="h-8 text-sm" value={editData.description} onChange={e => setEditData({ ...editData, description: e.target.value })} /></TableCell>
                        <TableCell>
                          <Select value={editData.project_id || '__none__'} onValueChange={v => setEditData({ ...editData, project_id: v === '__none__' ? null : v })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">—</SelectItem>
                              {directions.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell><Input className="h-8 w-16 text-sm text-center" type="number" min="1" max="31" value={editData.day_in_month || ''} onChange={e => setEditData({ ...editData, day_in_month: e.target.value })} /></TableCell>
                        <TableCell><Input className="h-8 text-sm text-right" type="number" step="0.01" value={editData.amount_planned} onChange={e => setEditData({ ...editData, amount_planned: e.target.value })} /></TableCell>
                        <TableCell className="text-center">
                          <Checkbox checked={editData.is_recurring_every_month} onCheckedChange={v => setEditData({ ...editData, is_recurring_every_month: v })} />
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={saveEdit}><Check className="h-4 w-4 text-emerald-500" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingId(null)}><X className="h-4 w-4" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      <TableRow key={item.id} className="group" data-testid={`plan-item-${item.id}`}>
                        <TableCell>
                          <Badge variant={item.type === 'fixed' ? 'default' : 'outline'} className={item.type === 'fixed' ? 'bg-blue-600/80 hover:bg-blue-600' : ''}>
                            {item.type === 'fixed' ? 'Постоянный' : 'Переменный'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{CATEGORIES[item.category] || item.category}</TableCell>
                        <TableCell className="text-sm font-medium">{item.description}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{dirName(item.project_id) || '—'}</TableCell>
                        <TableCell className="text-center text-sm">{item.day_in_month || '—'}</TableCell>
                        <TableCell className="text-right font-medium">{fmtMoney(item.amount_planned, item.currency)}</TableCell>
                        <TableCell className="text-center">
                          {item.is_recurring_every_month && <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-500">Ежем.</Badge>}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(item)}><Pencil className="h-3.5 w-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => deleteItem(item.id)}><Trash2 className="h-3.5 w-3.5 text-rose-500" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  ))}

                  {/* Inline add row */}
                  {adding && (
                    <TableRow className="bg-muted/20">
                      <TableCell>
                        <Select value={newItem.type} onValueChange={v => setNewItem({ ...newItem, type: v })}>
                          <SelectTrigger className="h-8 text-xs" data-testid="new-type"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="fixed">Постоянный</SelectItem>
                            <SelectItem value="variable">Переменный</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select value={newItem.category} onValueChange={v => setNewItem({ ...newItem, category: v })}>
                          <SelectTrigger className="h-8 text-xs" data-testid="new-category"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {Object.entries(CATEGORIES).map(([k, v]) => (
                              <SelectItem key={k} value={k}>{v}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Input className="h-8 text-sm" placeholder="Описание" value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })} data-testid="new-description" autoFocus />
                      </TableCell>
                      <TableCell>
                        <Select value={newItem.project_id || '__none__'} onValueChange={v => setNewItem({ ...newItem, project_id: v === '__none__' ? null : v })}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">—</SelectItem>
                            {directions.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input className="h-8 w-16 text-sm text-center" type="number" min="1" max="31" placeholder="—" value={newItem.day_in_month} onChange={e => setNewItem({ ...newItem, day_in_month: e.target.value })} /></TableCell>
                      <TableCell><Input className="h-8 text-sm text-right" type="number" step="0.01" placeholder="0.00" value={newItem.amount_planned} onChange={e => setNewItem({ ...newItem, amount_planned: e.target.value })} data-testid="new-amount" /></TableCell>
                      <TableCell className="text-center">
                        <Checkbox checked={newItem.is_recurring_every_month} onCheckedChange={v => setNewItem({ ...newItem, is_recurring_every_month: v })} data-testid="new-recurring" />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => addItem()} data-testid="save-new-btn"><Check className="h-4 w-4 text-emerald-500" /></Button>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setAdding(false)}><X className="h-4 w-4" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}

                  {items.length === 0 && !adding && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">
                        Нет позиций. Используйте быстрые кнопки выше или «Добавить строку».
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary Footer */}
      {items.length > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-muted-foreground">Постоянные расходы</div>
                <div className="text-xl font-bold text-blue-500">{fmtMoney(fixedTotal)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Переменные расходы</div>
                <div className="text-xl font-bold text-amber-500">{fmtMoney(variableTotal)}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground">Итого за {MONTH_NAMES[month]} {year}</div>
                <div className="text-2xl font-bold">{fmtMoney(grandTotal)}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Extend recurring dialog */}
      <Dialog open={showExtend} onOpenChange={setShowExtend}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Протянуть постоянные расходы</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              {recurringCount} постоянных расходов будут скопированы на следующие месяцы.
              Если план на месяц ещё не создан — он будет создан автоматически.
            </p>
            <div className="flex items-center gap-3">
              <span className="text-sm">Количество месяцев:</span>
              <Select value={String(extendMonths)} onValueChange={v => setExtendMonths(Number(v))}>
                <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 6, 9, 12].map(n => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtend(false)}>Отмена</Button>
            <Button onClick={extendRecurring} disabled={extending} data-testid="confirm-extend-btn">
              {extending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CalendarRange className="h-4 w-4 mr-2" />}
              Протянуть на {extendMonths} мес.
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
