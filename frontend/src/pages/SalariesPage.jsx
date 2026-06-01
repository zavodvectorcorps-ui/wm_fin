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
import { Plus, Pencil, Trash2, Banknote, Users as UsersIcon, Link2, Unlink, CheckCircle2, Send, Check, ChevronsUpDown, Calendar as CalendarIcon, BadgeCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '../components/ui/command';
import { Calendar as CalendarUI } from '../components/ui/calendar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '../components/ui/sheet';
import { ru } from 'date-fns/locale';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { formatCurrency } from '../lib/utils';
import { toast } from 'sonner';

const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const ruMonth = (ym) => {
  if (!/^\d{4}-\d{2}$/.test(ym)) return ym || '—';
  return format(new Date(ym + '-01'), 'LLLL yyyy', { locale: ru });
};

const MonthPickerSimple = ({ value, onChange, className, testId }) => {
  const [open, setOpen] = useState(false);
  const selected = value ? new Date(value + '-01') : null;
  const [displayMonth, setDisplayMonth] = useState(selected || new Date());
  useEffect(() => { if (selected) setDisplayMonth(selected); }, [value]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn("min-w-[160px] justify-start text-left font-normal", className)} data-testid={testId || 'month-picker'}>
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? ruMonth(value) : 'Месяц'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarUI
          mode="single"
          selected={selected || undefined}
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          onSelect={(d) => {
            if (d) {
              onChange(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
              setOpen(false);
            }
          }}
          locale={ru}
        />
      </PopoverContent>
    </Popover>
  );
};

const blankEmployee = {
  name: '',
  position: '',
  default_salary: '',
  default_bonus: '0',
  default_tax_rate: '0',
  currency: 'PLN',
  direction_id: '',
  contractor_id: '',
  is_active: true,
  comment: '',
};

const blankAccrual = {
  month: currentMonth(),
  employee_id: '',
  salary: '',
  bonus: '0',
  taxes: '0',
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

  const [contractors, setContractors] = useState([]);
  const [contractorPickerOpen, setContractorPickerOpen] = useState(false);
  const [fromContractorOpen, setFromContractorOpen] = useState(false);

  // Employee detail sheet
  const [empSheetOpen, setEmpSheetOpen] = useState(false);
  const [empSheetEmp, setEmpSheetEmp] = useState(null);
  const [empAccruals, setEmpAccruals] = useState([]);
  const [empSheetLoading, setEmpSheetLoading] = useState(false);

  const openEmployeeCard = async (emp) => {
    setEmpSheetEmp(emp);
    setEmpSheetOpen(true);
    setEmpSheetLoading(true);
    try {
      const r = await api().get('/salary-accruals', { params: { employee_id: emp.id } });
      setEmpAccruals(r.data || []);
    } catch {
      setEmpAccruals([]);
    } finally {
      setEmpSheetLoading(false);
    }
  };

  // Match dialog
  const [matchDialog, setMatchDialog] = useState(false);
  const [matchAccrual, setMatchAccrual] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // Quick-pay dialog (create new tx from accrual)
  const [payDialog, setPayDialog] = useState(false);
  const [payAccrual, setPayAccrual] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [payForm, setPayForm] = useState({ account_id: '', amount: '', date: '' });
  const [paySubmitting, setPaySubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, dRes, aRes, sRes, cRes, accRes] = await Promise.all([
        api().get('/employees'),
        api().get('/directions'),
        api().get('/salary-accruals', { params: { month: filterMonth } }),
        api().get('/salary-accruals/summary', { params: { month: filterMonth } }),
        api().get('/contractors').catch(() => ({ data: [] })),
        api().get('/accounts').catch(() => ({ data: [] })),
      ]);
      setEmployees(eRes.data);
      setDirections(dRes.data);
      setAccruals(aRes.data);
      setSummary(sRes.data);
      setContractors(cRes.data || []);
      setAccounts((accRes.data || []).filter(a => a.is_active && !a.is_loan));
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
  const createEmployeeFromContractor = async (contractor) => {
    setFromContractorOpen(false);
    try {
      const r = await api().post('/employees/from-contractor', {
        contractor_id: contractor.id,
      });
      toast.success(`Сотрудник «${contractor.name}» создан и связан`);
      await fetchData();
      // Open edit dialog so the user can fill in salary/position right away
      if (r.data) openEditEmployee(r.data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Ошибка');
    }
  };
  const openEditEmployee = (emp) => {
    setEmpEditing(emp);
    setEmpForm({
      name: emp.name,
      position: emp.position || '',
      default_salary: String(emp.default_salary || ''),
      default_bonus: String(emp.default_bonus || '0'),
      default_tax_rate: String(emp.default_tax_rate || '0'),
      currency: emp.currency || 'PLN',
      direction_id: emp.direction_id || '',
      contractor_id: emp.contractor_id || '',
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
      default_bonus: parseFloat(String(empForm.default_bonus || '0').replace(',', '.')) || 0,
      default_tax_rate: parseFloat(String(empForm.default_tax_rate || '0').replace(',', '.')) || 0,
      currency: empForm.currency,
      direction_id: empForm.direction_id || null,
      contractor_id: empForm.contractor_id || null,
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
      taxes: String(a.taxes || 0),
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
      taxes: num(accForm.taxes),
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
        const baseSalary = e.default_salary || 0;
        const baseBonus = e.default_bonus || 0;
        const baseTaxes = Math.round((baseSalary + baseBonus) * (e.default_tax_rate || 0)) / 100;
        await api().post('/salary-accruals', {
          month: filterMonth,
          employee_id: e.id,
          salary: baseSalary,
          bonus: baseBonus,
          taxes: baseTaxes,
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
  const unlinkTransaction = async (accrualId, transactionId = null) => {
    try {
      await api().post(`/salary-accruals/${accrualId}/unlink-transaction`,
        transactionId ? { transaction_id: transactionId } : {});
      toast.success('Отвязано');
      fetchData();
    } catch {
      toast.error('Ошибка');
    }
  };

  // Quick-pay flow: create a new expense tx from an accrual and link it
  const openPay = (a) => {
    setPayAccrual(a);
    const remaining = a.remaining ?? (a.total_due - (a.total_paid || 0));
    const today = new Date().toISOString().slice(0, 10);
    setPayForm({
      account_id: '',
      amount: String(remaining > 0 ? remaining : a.total_due || ''),
      date: today,
    });
    setPayDialog(true);
  };
  const submitPay = async () => {
    if (!payAccrual || !payForm.account_id) {
      toast.error('Выберите счёт');
      return;
    }
    const amt = parseFloat(String(payForm.amount).replace(',', '.'));
    if (!amt || amt <= 0) {
      toast.error('Укажите корректную сумму');
      return;
    }
    setPaySubmitting(true);
    try {
      await api().post(`/salary-accruals/${payAccrual.id}/create-transaction`, {
        account_id: payForm.account_id,
        amount: amt,
        date: payForm.date,
      });
      toast.success('Операция создана и привязана');
      setPayDialog(false);
      fetchData();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка');
    } finally {
      setPaySubmitting(false);
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
                <MonthPickerSimple value={filterMonth} onChange={setFilterMonth} testId="filter-month" />
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
                  {accruals.map(a => {
                    const paid = a.total_paid || 0;
                    const remaining = a.remaining || 0;
                    const due = a.total_due || 0;
                    const pct = due > 0 ? Math.min(100, (paid / due) * 100) : 0;
                    const statusBadge = a.status === 'paid' ? (
                      <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-xs">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        Выплачено
                      </Badge>
                    ) : a.status === 'partial' ? (
                      <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-xs">
                        Частично · {pct.toFixed(0)}%
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                        К выплате
                      </Badge>
                    );
                    return (
                    <div key={a.id} className="flex flex-col p-3 rounded-lg border border-border bg-muted/30 gap-2" data-testid={`accrual-row-${a.id}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{a.employee_name}</p>
                            {statusBadge}
                            {a.direction_name && <Badge variant="outline" className="text-xs">{a.direction_name}</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Оклад {formatCurrency(a.salary, a.currency)}
                            {a.bonus ? ` + премия ${formatCurrency(a.bonus, a.currency)}` : ''}
                            {a.taxes ? ` − налоги ${formatCurrency(a.taxes, a.currency)}` : ''}
                            {a.deductions ? ` − удержания ${formatCurrency(a.deductions, a.currency)}` : ''}
                            {a.comment ? ` · ${a.comment}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <div className="text-right">
                            <p className="text-lg font-bold font-mono">
                              {formatCurrency(due, a.currency)}
                            </p>
                            {paid > 0 && (
                              <p className="text-[10px] font-mono text-muted-foreground">
                                выплачено <span className="text-emerald-500">{formatCurrency(paid, a.currency)}</span>
                                {remaining > 0.5 && <> · осталось <span className="text-amber-500">{formatCurrency(remaining, a.currency)}</span></>}
                              </p>
                            )}
                          </div>
                          <Button variant="outline" size="sm" onClick={() => openMatch(a)} data-testid={`link-tx-${a.id}`}>
                            <Link2 className="h-4 w-4 mr-1" />
                            {paid > 0 ? 'Ещё выплата' : 'Связать'}
                          </Button>
                          {remaining > 0.5 && (
                            <Button variant="default" size="sm" onClick={() => openPay(a)} data-testid={`pay-from-plan-${a.id}`} title="Создать новую расходную операцию из этого начисления">
                              <Send className="h-4 w-4 mr-1" />
                              В операции
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
                      {/* Progress bar + list of payments */}
                      {paid > 0 && (
                        <>
                          <div className="h-1.5 rounded bg-border overflow-hidden">
                            <div
                              className={`h-full transition-all ${a.status === 'paid' ? 'bg-emerald-500' : 'bg-sky-500'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          {Array.isArray(a.payments) && a.payments.length > 0 && (
                            <div className="flex flex-col gap-1 pl-1" data-testid={`payments-list-${a.id}`}>
                              {a.payments.map(p => (
                                <div key={p.id} className="flex items-center justify-between text-[11px] text-muted-foreground gap-2">
                                  <span className="truncate">
                                    {p.date} · {p.account_name || '—'} · {p.description || '(без описания)'}
                                  </span>
                                  <span className="flex items-center gap-1.5 shrink-0">
                                    <span className="font-mono text-emerald-400">{formatCurrency(p.amount, a.currency)}</span>
                                    <button
                                      type="button"
                                      className="text-rose-400 hover:text-rose-300"
                                      title="Отвязать"
                                      onClick={() => unlinkTransaction(a.id, p.id)}
                                      data-testid={`unlink-payment-${p.id}`}
                                    >
                                      <Unlink className="h-3 w-3" />
                                    </button>
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    );
                  })}
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
              <div className="flex items-center gap-2">
                <Popover open={fromContractorOpen} onOpenChange={setFromContractorOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" data-testid="add-employee-from-contractor-btn">
                      <UsersIcon className="h-4 w-4 mr-2" />
                      Из контрагента
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-0" align="end">
                    <Command>
                      <CommandInput placeholder="Найти контрагента…" data-testid="from-contractor-search" />
                      <CommandList>
                        <CommandEmpty>Нет доступных контрагентов</CommandEmpty>
                        <CommandGroup>
                          {contractors
                            .filter(c => !employees.some(e => e.contractor_id === c.id))
                            .map(c => (
                              <CommandItem
                                key={c.id}
                                value={`${c.name} ${c.type || ''}`}
                                onSelect={() => createEmployeeFromContractor(c)}
                                data-testid={`from-contractor-option-${c.id}`}
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                <div className="flex flex-col">
                                  <span>{c.name}</span>
                                  {c.type && <span className="text-[10px] text-muted-foreground">{c.type}</span>}
                                </div>
                              </CommandItem>
                            ))
                          }
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                <Button onClick={openNewEmployee} data-testid="add-employee-btn">
                  <Plus className="h-4 w-4 mr-2" />
                  Добавить
                </Button>
              </div>
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
                    <div
                      key={e.id}
                      className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50 ${e.is_active ? 'border-border bg-muted/30' : 'border-border/50 bg-muted/10 opacity-60'}`}
                      onClick={() => openEmployeeCard(e)}
                      data-testid={`employee-row-${e.id}`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium">{e.name}</p>
                          {e.position && <span className="text-xs text-muted-foreground">{e.position}</span>}
                          {e.direction_name && <Badge variant="outline" className="text-xs">{e.direction_name}</Badge>}
                          {e.contractor_id && <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-500 gap-1"><BadgeCheck className="h-3 w-3" />связан</Badge>}
                          {!e.is_active && <Badge variant="outline" className="text-xs">Архив</Badge>}
                        </div>
                        {e.comment && <p className="text-xs text-muted-foreground mt-0.5">{e.comment}</p>}
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <p className="text-lg font-bold font-mono">{formatCurrency(e.default_salary, e.currency)}</p>
                        <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); openEditEmployee(e); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={(ev) => { ev.stopPropagation(); deleteEmployee(e.id); }}>
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
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                Связанный контрагент
                <span className="text-[10px] text-muted-foreground">(для авто-привязки фактических выплат)</span>
              </Label>
              <Popover open={contractorPickerOpen} onOpenChange={setContractorPickerOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={contractorPickerOpen}
                    className="w-full justify-between font-normal"
                    data-testid="emp-contractor-select"
                  >
                    {empForm.contractor_id
                      ? (contractors.find(c => c.id === empForm.contractor_id)?.name || '—')
                      : <span className="text-muted-foreground">Не связан</span>}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Найти контрагента…" data-testid="emp-contractor-search" />
                    <CommandList>
                      <CommandEmpty>Не найдено.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem
                          value="__none__ Не связан"
                          onSelect={() => {
                            setEmpForm({ ...empForm, contractor_id: '' });
                            setContractorPickerOpen(false);
                          }}
                          data-testid="emp-contractor-option-none"
                        >
                          <Check className={cn("mr-2 h-4 w-4", !empForm.contractor_id ? "opacity-100" : "opacity-0")} />
                          <span className="text-muted-foreground">Не связан</span>
                        </CommandItem>
                        {contractors.map(c => (
                          <CommandItem
                            key={c.id}
                            // value drives search — include name + type so search works on both
                            value={`${c.name} ${c.type || ''}`}
                            onSelect={() => {
                              setEmpForm({ ...empForm, contractor_id: c.id });
                              setContractorPickerOpen(false);
                            }}
                            data-testid={`emp-contractor-option-${c.id}`}
                          >
                            <Check className={cn("mr-2 h-4 w-4", empForm.contractor_id === c.id ? "opacity-100" : "opacity-0")} />
                            <div className="flex flex-col">
                              <span>{c.name}</span>
                              {c.type && <span className="text-[10px] text-muted-foreground">{c.type}</span>}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
                  data-testid="emp-default-salary"
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Базовая премия (для менеджеров)</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={empForm.default_bonus}
                  onChange={(e) => setEmpForm({ ...empForm, default_bonus: e.target.value })}
                  placeholder="0"
                  data-testid="emp-default-bonus"
                />
                <p className="text-xs text-muted-foreground">Подставится автоматически в новое начисление</p>
              </div>
              <div className="space-y-2">
                <Label>Налоги по умолчанию, %</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={empForm.default_tax_rate}
                  onChange={(e) => setEmpForm({ ...empForm, default_tax_rate: e.target.value })}
                  placeholder="0"
                  data-testid="emp-default-tax-rate"
                />
                <p className="text-xs text-muted-foreground">% от (оклад + премия). Для PL обычно 12-32%.</p>
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
                <MonthPickerSimple
                  value={accForm.month}
                  onChange={(v) => setAccForm({ ...accForm, month: v })}
                  testId="accrual-month-picker"
                />
              </div>
              <div className="space-y-2">
                <Label>Сотрудник *</Label>
                <Select
                  value={accForm.employee_id}
                  onValueChange={(v) => {
                    const emp = employees.find(x => x.id === v);
                    if (accEditing) {
                      setAccForm({ ...accForm, employee_id: v });
                    } else if (emp) {
                      const sal = emp.default_salary || 0;
                      const bon = emp.default_bonus || 0;
                      const tax = Math.round((sal + bon) * (emp.default_tax_rate || 0)) / 100;
                      setAccForm({
                        ...accForm,
                        employee_id: v,
                        salary: String(sal),
                        bonus: String(bon),
                        taxes: String(tax),
                      });
                    } else {
                      setAccForm({ ...accForm, employee_id: v });
                    }
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
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Оклад</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={accForm.salary}
                  onChange={(e) => setAccForm({ ...accForm, salary: e.target.value })}
                  data-testid="acc-salary"
                />
              </div>
              <div className="space-y-2">
                <Label>Премия</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={accForm.bonus}
                  onChange={(e) => setAccForm({ ...accForm, bonus: e.target.value })}
                  data-testid="acc-bonus"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Налоги</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={accForm.taxes}
                  onChange={(e) => setAccForm({ ...accForm, taxes: e.target.value })}
                  data-testid="acc-taxes"
                />
                <p className="text-xs text-muted-foreground">ZUS, PIT и т.д. Авто из % сотрудника</p>
              </div>
              <div className="space-y-2">
                <Label>Прочие удержания</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={accForm.deductions}
                  onChange={(e) => setAccForm({ ...accForm, deductions: e.target.value })}
                  data-testid="acc-deductions"
                />
              </div>
            </div>
            <div className="p-3 rounded-lg bg-muted/50 text-sm flex justify-between">
              <span>К выплате (оклад + премия − налоги − удержания):</span>
              <span className="font-mono font-bold text-lg" data-testid="acc-total-due">
                {formatCurrency(
                  (parseFloat(String(accForm.salary || 0).replace(',', '.')) || 0) +
                  (parseFloat(String(accForm.bonus || 0).replace(',', '.')) || 0) -
                  (parseFloat(String(accForm.taxes || 0).replace(',', '.')) || 0) -
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

      {/* Quick-Pay Dialog: create new tx straight from accrual */}
      <Dialog open={payDialog} onOpenChange={setPayDialog}>
        <DialogContent className="max-w-md" data-testid="pay-from-plan-dialog">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-4 w-4 text-emerald-500" />
              Создать расходную операцию
            </DialogTitle>
            <DialogDescription>
              {payAccrual && (
                <>
                  {payAccrual.employee_name} · {payAccrual.month}
                  <br />
                  <span className="text-xs">
                    Начислено {formatCurrency(payAccrual.total_due, payAccrual.currency)} · уже выплачено {formatCurrency(payAccrual.total_paid || 0, payAccrual.currency)} · остаток <span className="text-amber-500">{formatCurrency(payAccrual.remaining || 0, payAccrual.currency)}</span>
                  </span>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Счёт, с которого платим *</Label>
              <Select value={payForm.account_id} onValueChange={(v) => setPayForm(f => ({ ...f, account_id: v }))}>
                <SelectTrigger data-testid="pay-account-select"><SelectValue placeholder="Выберите счёт" /></SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name} <span className="text-[10px] text-muted-foreground">({a.currency})</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                Банковский счёт — для безналичной выплаты, касса — для наличной.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Сумма</Label>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={payForm.amount}
                  onChange={(e) => setPayForm(f => ({ ...f, amount: e.target.value }))}
                  placeholder="0"
                  data-testid="pay-amount-input"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Дата</Label>
                <Input
                  type="date"
                  value={payForm.date}
                  onChange={(e) => setPayForm(f => ({ ...f, date: e.target.value }))}
                  data-testid="pay-date-input"
                />
              </div>
            </div>
            {payAccrual && (
              <p className="text-[10px] text-muted-foreground">
                Описание: «Зарплата {payAccrual.employee_name} за {payAccrual.month}» · контрагент авто-подставится из карточки сотрудника · после создания операция автоматически привяжется к этому начислению.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPayDialog(false)} disabled={paySubmitting}>Отмена</Button>
            <Button onClick={submitPay} disabled={paySubmitting || !payForm.account_id} data-testid="pay-submit-btn">
              {paySubmitting ? 'Создаём…' : 'Создать и привязать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Employee detail Sheet — history of accruals */}
      <Sheet open={empSheetOpen} onOpenChange={setEmpSheetOpen}>
        <SheetContent className="sm:max-w-xl overflow-y-auto" data-testid="employee-card-sheet">
          {empSheetEmp && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <UsersIcon className="h-5 w-5 text-primary" />
                  {empSheetEmp.name}
                </SheetTitle>
                <SheetDescription>
                  {empSheetEmp.position || 'Сотрудник'} · {empSheetEmp.direction_name || 'без направления'}
                </SheetDescription>
              </SheetHeader>

              {/* Profile summary */}
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Оклад по умолчанию</p>
                  <p className="font-mono font-semibold">{formatCurrency(empSheetEmp.default_salary, empSheetEmp.currency)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Налог</p>
                  <p className="font-mono">{empSheetEmp.default_tax_rate || 0}%</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Валюта</p>
                  <p className="font-mono">{empSheetEmp.currency}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground uppercase">Статус</p>
                  <p>{empSheetEmp.is_active ? 'Активен' : 'Архив'}</p>
                </div>
                {empSheetEmp.contractor_id && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-muted-foreground uppercase">Связанный контрагент</p>
                    <p className="text-emerald-500">{contractors.find(c => c.id === empSheetEmp.contractor_id)?.name || '—'}</p>
                  </div>
                )}
                {empSheetEmp.comment && (
                  <div className="col-span-2">
                    <p className="text-[10px] text-muted-foreground uppercase">Комментарий</p>
                    <p className="text-muted-foreground">{empSheetEmp.comment}</p>
                  </div>
                )}
              </div>

              {/* Aggregate stats */}
              {(() => {
                const totalDue = empAccruals.reduce((s, a) => s + (a.total_due || 0), 0);
                const totalPaid = empAccruals.reduce((s, a) => s + (a.total_paid || 0), 0);
                const totalRem = empAccruals.reduce((s, a) => s + (a.remaining || 0), 0);
                return (
                  <div className="mt-5 grid grid-cols-3 gap-2 p-3 rounded-lg bg-muted/40 border border-border">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Всего начислено</p>
                      <p className="font-mono font-bold text-base">{formatCurrency(totalDue, empSheetEmp.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Выплачено</p>
                      <p className="font-mono font-bold text-base text-emerald-500">{formatCurrency(totalPaid, empSheetEmp.currency)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase">Остаток</p>
                      <p className={`font-mono font-bold text-base ${totalRem > 0 ? 'text-amber-500' : 'text-muted-foreground'}`}>{formatCurrency(totalRem, empSheetEmp.currency)}</p>
                    </div>
                  </div>
                );
              })()}

              {/* Accruals history list */}
              <div className="mt-5">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">История начислений ({empAccruals.length})</p>
                {empSheetLoading ? (
                  <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : empAccruals.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">Начислений пока не было</p>
                ) : (
                  <div className="space-y-2" data-testid="employee-accruals-history">
                    {empAccruals.map(a => {
                      const pct = a.total_due > 0 ? Math.min(100, ((a.total_paid || 0) / a.total_due) * 100) : 0;
                      return (
                        <div key={a.id} className="p-2.5 rounded-md border border-border bg-card hover:bg-muted/30 transition-colors">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-medium text-sm">{ruMonth(a.month)}</span>
                              {a.status === 'paid' && <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]"><CheckCircle2 className="h-3 w-3 mr-0.5" />Выплачено</Badge>}
                              {a.status === 'partial' && <Badge className="bg-sky-500/10 text-sky-500 border-sky-500/20 text-[10px]">Частично · {pct.toFixed(0)}%</Badge>}
                              {a.status === 'planned' && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-500">К выплате</Badge>}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="font-mono font-semibold text-sm">{formatCurrency(a.total_due, a.currency)}</p>
                              {(a.total_paid > 0) && (
                                <p className="text-[10px] font-mono text-muted-foreground">
                                  выплачено <span className="text-emerald-500">{formatCurrency(a.total_paid, a.currency)}</span>
                                </p>
                              )}
                            </div>
                          </div>
                          {a.total_paid > 0 && (
                            <div className="h-1 mt-2 rounded bg-border overflow-hidden">
                              <div className={`h-full ${a.status === 'paid' ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default SalariesPage;
