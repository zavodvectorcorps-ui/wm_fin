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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Switch } from '../components/ui/switch';
import { Plus, Pencil, Trash2, Banknote, Users as UsersIcon, Link2, Unlink, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { toast } from 'sonner';

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const blankEmployee = {
  name: '',
  position: '',
  default_salary: '',
  currency: 'PLN',
  direction_id: '',
  is_active: true,
  comment: '',
};

const blankAccrual = {
  month: currentMonth(),
  employee_id: '',
  salary: '',
  bonus: '0',
  deductions: '0',
  comment: '',
};

export const SalariesPage = () => {
  const { api } = useAuth();
  const [tab, setTab] = useState('accruals');
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [directions, setDirections] = useState([]);
  const [accruals, setAccruals] = useState([]);
  const [summary, setSummary] = useState(null);
  const [filterMonth, setFilterMonth] = useState(currentMonth());

  // Employee dialog
  const [empDialog, setEmpDialog] = useState(false);
  const [empEditing, setEmpEditing] = useState(null);
  const [empForm, setEmpForm] = useState(blankEmployee);

  // Accrual dialog
  const [accDialog, setAccDialog] = useState(false);
  const [accEditing, setAccEditing] = useState(null);
  const [accForm, setAccForm] = useState(blankAccrual);

  // Match dialog
  const [matchDialog, setMatchDialog] = useState(false);
  const [matchAccrual, setMatchAccrual] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, dRes, aRes, sRes] = await Promise.all([
        api().get('/employees'),
        api().get('/directions'),
        api().get('/salary-accruals', { params: { month: filterMonth } }),
        api().get('/salary-accruals/summary', { params: { month: filterMonth } }),
      ]);
      setEmployees(eRes.data);
      setDirections(dRes.data);
      setAccruals(aRes.data);
      setSummary(sRes.data);
    } catch {
      toast.error('Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [api, filterMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ============ Employees ============
  const openNewEmployee = () => {
    setEmpEditing(null);
    setEmpForm(blankEmployee);
    setEmpDialog(true);
  };
  const openEditEmployee = (emp) => {
    setEmpEditing(emp);
    setEmpForm({
      name: emp.name,
      position: emp.position || '',
      default_salary: String(emp.default_salary || ''),
      currency: emp.currency || 'PLN',
      direction_id: emp.direction_id || '',
      is_active: emp.is_active,
      comment: emp.comment || '',
    });
    setEmpDialog(true);
  };
  const saveEmployee = async () => {
    if (!empForm.name) {
      toast.error('Укажите имя');
      return;
    }
    const payload = {
      name: empForm.name,
      position: empForm.position || null,
      default_salary: parseFloat(String(empForm.default_salary || '0').replace(',', '.')) || 0,
      currency: empForm.currency,
      direction_id: empForm.direction_id || null,
      is_active: empForm.is_active,
      comment: empForm.comment || null,
    };
    try {
      if (empEditing) {
        await api().put(`/employees/${empEditing.id}`, payload);
      } else {
        await api().post('/employees', payload);
      }
      toast.success('Сохранено');
      setEmpDialog(false);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка');
    }
  };
  const deleteEmployee = async (id) => {
    if (!window.confirm('Удалить сотрудника? Начисления останутся.')) return;
    try {
      await api().delete(`/employees/${id}`);
      toast.success('Удалено');
      fetchData();
    } catch {
      toast.error('Ошибка');
    }
  };

  // ============ Accruals ============
  const openNewAccrual = () => {
    setAccEditing(null);
    setAccForm({ ...blankAccrual, month: filterMonth });
    setAccDialog(true);
  };
  const openEditAccrual = (a) => {
    setAccEditing(a);
    setAccForm({
      month: a.month,
      employee_id: a.employee_id,
      salary: String(a.salary),
      bonus: String(a.bonus || 0),
      deductions: String(a.deductions || 0),
      comment: a.comment || '',
    });
    setAccDialog(true);
  };
  const saveAccrual = async () => {
    if (!accForm.employee_id) {
      toast.error('Выберите сотрудника');
      return;
    }
    const num = (v) => parseFloat(String(v || '0').replace(',', '.')) || 0;
    const payload = {
      month: accForm.month,
      employee_id: accForm.employee_id,
      salary: num(accForm.salary),
      bonus: num(accForm.bonus),
      deductions: num(accForm.deductions),
      comment: accForm.comment || null,
    };
    try {
      if (accEditing) {
        await api().put(`/salary-accruals/${accEditing.id}`, payload);
      } else {
        await api().post('/salary-accruals', payload);
      }
      toast.success('Сохранено');
      setAccDialog(false);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка');
    }
  };
  const deleteAccrual = async (id) => {
    if (!window.confirm('Удалить начисление?')) return;
    try {
      await api().delete(`/salary-accruals/${id}`);
      toast.success('Удалено');
      fetchData();
    } catch {
      toast.error('Ошибка');
    }
  };

  const generateForAll = async () => {
    if (!window.confirm(`Создать начисления на ${filterMonth} для всех активных сотрудников по их окладам по умолчанию?`)) return;
    let created = 0;
    let skipped = 0;
    for (const e of employees.filter(emp => emp.is_active)) {
      try {
        await api().post('/salary-accruals', {
          month: filterMonth,
          employee_id: e.id,
          salary: e.default_salary || 0,
          bonus: 0,
          deductions: 0,
        });
        created += 1;
      } catch {
        skipped += 1;
      }
    }
    toast.success(`Создано: ${created}, пропущено (уже есть): ${skipped}`);
    fetchData();
  };

  // ============ Match ============
  const openMatch = async (accrual) => {
    setMatchAccrual(accrual);
    setMatchDialog(true);
    setLoadingMatches(true);
    try {
      const res = await api().get(`/salary-accruals/${accrual.id}/suggest-matches`);
      setCandidates(res.data.candidates || []);
    } catch {
      setCandidates([]);
    } finally {
      setLoadingMatches(false);
    }
  };
  const linkTransaction = async (txId) => {
    try {
      await api().post(`/salary-accruals/${matchAccrual.id}/link-transaction`, { transaction_id: txId });
      toast.success('Привязано — отмечено как выплачено');
      setMatchDialog(false);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка');
    }
  };
  const unlinkTransaction = async (accrualId) => {
    try {
      await api().post(`/salary-accruals/${accrualId}/unlink-transaction`);
      toast.success('Отвязано');
      fetchData();
    } catch {
      toast.error('Ошибка');
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Banknote className="h-7 w-7 text-emerald-500" />
            Зарплаты
          </h1>
          <p className="text-muted-foreground">ФОТ: расчёт начислений и сверка с фактическими выплатами</p>
        </div>
      </div>

      {/* Summary card */}
      {summary && (
        <Card className="border-l-4 border-l-emerald-500" data-testid="salary-summary-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle>ФОТ за {filterMonth}</CardTitle>
              <Badge variant="outline" className="text-xs">{summary.employees_count} начислений</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase">Начислено</p>
                <p className="text-2xl font-bold font-mono text-foreground">{formatCurrency(summary.total_accrued)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase">Выплачено</p>
                <p className="text-2xl font-bold font-mono text-emerald-500">{formatCurrency(summary.total_paid)}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground uppercase">Осталось</p>
                <p className="text-2xl font-bold font-mono text-amber-500">{formatCurrency(summary.total_pending)}</p>
              </div>
            </div>
            {Object.keys(summary.by_direction || {}).length > 0 && (
              <div className="mt-4 pt-3 border-t border-border">
                <p className="text-xs text-muted-foreground mb-2">По направлениям:</p>
                <div className="grid gap-1 md:grid-cols-2">
                  {Object.entries(summary.by_direction).map(([name, vals]) => (
                    <div key={name} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{name}</span>
                      <span className="font-mono">{formatCurrency(vals.paid)} / {formatCurrency(vals.accrued)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="accruals" data-testid="tab-accruals">
            <Banknote className="h-4 w-4 mr-2" />
            Начисления
          </TabsTrigger>
          <TabsTrigger value="employees" data-testid="tab-employees">
            <UsersIcon className="h-4 w-4 mr-2" />
            Сотрудники
          </TabsTrigger>
        </TabsList>

        {/* ============ Accruals Tab ============ */}
        <TabsContent value="accruals">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
              <div>
                <CardTitle>Начисления зарплат</CardTitle>
                <CardDescription>Месяц: {filterMonth}</CardDescription>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Input
                  type="month"
                  value={filterMonth}
                  onChange={(e) => setFilterMonth(e.target.value)}
                  className="w-40"
                  data-testid="filter-month"
                />
                <Button variant="outline" onClick={generateForAll} disabled={employees.filter(e => e.is_active).length === 0}>
                  Создать по окладам
                </Button>
                <Button onClick={openNewAccrual}>
                  <Plus className="h-4 w-4 mr-2" />
                  Начислить
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : accruals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Нет начислений за {filterMonth}
                </div>
              ) : (
                <div className="space-y-2">
                  {accruals.map(a => (
                    <div key={a.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30 gap-3" data-testid={`accrual-row-${a.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{a.employee_name}</p>
                          {a.status === 'paid' ? (
                            <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Выплачено
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                              К выплате
                            </Badge>
                          )}
                          {a.direction_name && <Badge variant="outline" className="text-xs">{a.direction_name}</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Оклад {formatCurrency(a.salary, a.currency)}
                          {a.bonus ? ` + премия ${formatCurrency(a.bonus, a.currency)}` : ''}
                          {a.deductions ? ` − удержания ${formatCurrency(a.deductions, a.currency)}` : ''}
                          {a.comment ? ` · ${a.comment}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <p className="text-lg font-bold font-mono">
                          {formatCurrency(a.total_due, a.currency)}
                        </p>
                        {a.status === 'paid' ? (
                          <Button variant="ghost" size="sm" onClick={() => unlinkTransaction(a.id)} title="Отвязать">
                            <Unlink className="h-4 w-4" />
                          </Button>
                        ) : (
                          <Button variant="outline" size="sm" onClick={() => openMatch(a)}>
                            <Link2 className="h-4 w-4 mr-1" />
                            Связать
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" onClick={() => openEditAccrual(a)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteAccrual(a.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ Employees Tab ============ */}
        <TabsContent value="employees">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Сотрудники</CardTitle>
                <CardDescription>Имя, должность, оклад по умолчанию</CardDescription>
              </div>
              <Button onClick={openNewEmployee}>
                <Plus className="h-4 w-4 mr-2" />
                Добавить
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : employees.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Нет сотрудников
                </div>
              ) : (
                <div className="space-y-2">
                  {employees.map(e => (
                    <div key={e.id} className={`flex items-center justify-between p-3 rounded-lg border ${e.is_active ? 'border-border bg-muted/30' : 'border-border/50 bg-muted/10 opacity-60'}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{e.name}</p>
                          {e.position && <span className="text-xs text-muted-foreground">{e.position}</span>}
                          {e.direction_name && <Badge variant="outline" className="text-xs">{e.direction_name}</Badge>}
                          {!e.is_active && <Badge variant="outline" className="text-xs">Архив</Badge>}
                        </div>
                        {e.comment && <p className="text-xs text-muted-foreground mt-0.5">{e.comment}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <p className="text-lg font-bold font-mono">{formatCurrency(e.default_salary, e.currency)}</p>
                        <Button variant="ghost" size="icon" onClick={() => openEditEmployee(e)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => deleteEmployee(e.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Employee Dialog */}
      <Dialog open={empDialog} onOpenChange={setEmpDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{empEditing ? 'Редактировать сотрудника' : 'Новый сотрудник'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>Имя *</Label>
              <Input
                value={empForm.name}
                onChange={(e) => setEmpForm({ ...empForm, name: e.target.value })}
                placeholder="Иван Иванов"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Должность</Label>
                <Input
                  value={empForm.position}
                  onChange={(e) => setEmpForm({ ...empForm, position: e.target.value })}
                  placeholder="Менеджер, мастер..."
                />
              </div>
              <div className="space-y-2">
                <Label>Направление</Label>
                <Select value={empForm.direction_id || 'none'} onValueChange={(v) => setEmpForm({ ...empForm, direction_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без направления</SelectItem>
                    {directions.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Оклад по умолчанию</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={empForm.default_salary}
                  onChange={(e) => setEmpForm({ ...empForm, default_salary: e.target.value })}
                  placeholder="5000"
                />
              </div>
              <div className="space-y-2">
                <Label>Валюта</Label>
                <Select value={empForm.currency} onValueChange={(v) => setEmpForm({ ...empForm, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Input
                value={empForm.comment}
                onChange={(e) => setEmpForm({ ...empForm, comment: e.target.value })}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Активен</Label>
              <Switch checked={empForm.is_active} onCheckedChange={(v) => setEmpForm({ ...empForm, is_active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmpDialog(false)}>Отмена</Button>
            <Button onClick={saveEmployee}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Accrual Dialog */}
      <Dialog open={accDialog} onOpenChange={setAccDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{accEditing ? 'Редактировать начисление' : 'Новое начисление'}</DialogTitle>
            <DialogDescription>Расчётная часть. После выплаты — связать с фактической операцией.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Месяц *</Label>
                <Input
                  type="month"
                  value={accForm.month}
                  onChange={(e) => setAccForm({ ...accForm, month: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Сотрудник *</Label>
                <Select
                  value={accForm.employee_id}
                  onValueChange={(v) => {
                    const emp = employees.find(x => x.id === v);
                    setAccForm({
                      ...accForm,
                      employee_id: v,
                      salary: accEditing || accForm.salary ? accForm.salary : String(emp?.default_salary || ''),
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    {employees.filter(e => e.is_active).map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Оклад</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={accForm.salary}
                  onChange={(e) => setAccForm({ ...accForm, salary: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Премия</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={accForm.bonus}
                  onChange={(e) => setAccForm({ ...accForm, bonus: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Удержания</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={accForm.deductions}
                  onChange={(e) => setAccForm({ ...accForm, deductions: e.target.value })}
                />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-sm flex justify-between">
              <span>К выплате:</span>
              <span className="font-mono font-bold text-lg">
                {formatCurrency(
                  (parseFloat(String(accForm.salary || 0).replace(',', '.')) || 0) +
                  (parseFloat(String(accForm.bonus || 0).replace(',', '.')) || 0) -
                  (parseFloat(String(accForm.deductions || 0).replace(',', '.')) || 0)
                )}
              </span>
            </div>
            <div className="space-y-2">
              <Label>Комментарий</Label>
              <Input
                value={accForm.comment}
                onChange={(e) => setAccForm({ ...accForm, comment: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccDialog(false)}>Отмена</Button>
            <Button onClick={saveAccrual}>Сохранить</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Match Dialog */}
      <Dialog open={matchDialog} onOpenChange={setMatchDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Связать с операцией</DialogTitle>
            <DialogDescription>
              {matchAccrual && `${matchAccrual.employee_name} · ${matchAccrual.month} · ${formatCurrency(matchAccrual.total_due, matchAccrual.currency)}`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {loadingMatches ? (
              <Skeleton className="h-32 w-full" />
            ) : candidates.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Подходящих операций не найдено. Создайте операцию-расход в разделе «Операции» с этой суммой и датой, затем повторите попытку.
              </div>
            ) : (
              candidates.map(t => (
                <div key={t.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 cursor-pointer" onClick={() => linkTransaction(t.id)}>
                  <div>
                    <p className="font-medium">{t.description || t.contractor_name || t.category_name || 'Операция'}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.date} · {t.account_name} · {t.direction_name}
                    </p>
                  </div>
                  <p className="text-lg font-mono font-bold text-rose-500">
                    {formatCurrency(t.amount, t.currency)}
                  </p>
                </div>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchDialog(false)}>Закрыть</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SalariesPage;
