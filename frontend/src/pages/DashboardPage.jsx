import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Button } from '../components/ui/button';
import { Calendar as CalendarUI } from '../components/ui/calendar';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Checkbox } from '../components/ui/checkbox';
import { ru } from 'date-fns/locale';
import { format } from 'date-fns';
import { 
  TrendingUp, TrendingDown, Wallet, PiggyBank, 
  ArrowUpRight, ArrowDownRight, Calendar, Users, Flame, Info, Banknote, Repeat,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { formatCurrency, getPeriodDates, getDirectionClass, getChangePercent } from '../lib/utils';
import { AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const COLORS = {
  'Теплицы': '#3b82f6',
  'Сауны': '#f97316',
  'Купели': '#22c55e',
  'Общее': '#6b7280'
};

const PIE_COLORS = ['#3b82f6', '#f97316', '#22c55e', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1'];

export const DashboardPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('current_month');
  const [data, setData] = useState(null);
  const [dailyBalance, setDailyBalance] = useState([]);
  const [prevData, setPrevData] = useState(null);
  const [topContractors, setTopContractors] = useState([]);
  const [runway, setRunway] = useState(null);
  const [salarySummary, setSalarySummary] = useState(null);
  const [fixedCostsMonth, setFixedCostsMonth] = useState(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState(new Set());
  const [eurPlnRate, setEurPlnRate] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dates = getPeriodDates(period);
      const prevDates = getPeriodDates('prev_month');
      
      const [summaryRes, dailyRes, prevSummaryRes, topContractorsRes, runwayRes, salaryRes, fixedRes] = await Promise.all([
        api().get('/analytics/summary', { params: { date_from: dates.from, date_to: dates.to } }),
        api().get('/analytics/daily-balance', { params: { date_from: dates.from, date_to: dates.to } }),
        api().get('/analytics/summary', { params: { date_from: prevDates.from, date_to: prevDates.to } }),
        api().get('/analytics/top-contractors', { params: { date_from: dates.from, date_to: dates.to, limit: 5 } }),
        api().get('/analytics/runway').catch(() => ({ data: null })),
        api().get('/salary-accruals/summary').catch(() => ({ data: null })),
        api().get('/analytics/fixed-costs-month').catch(() => ({ data: null })),
      ]);
      
      setData(summaryRes.data);
      setDailyBalance(dailyRes.data);
      setPrevData(prevSummaryRes.data);
      setTopContractors(topContractorsRes.data.contractors || []);
      setRunway(runwayRes.data);
      setSalarySummary(salaryRes.data);
      setFixedCostsMonth(fixedRes.data);
      // Auto-select all accounts on first load
      if (summaryRes.data?.accounts?.length > 0 && selectedAccountIds.size === 0) {
        setSelectedAccountIds(new Set(summaryRes.data.accounts.map(a => a.id)));
      }
      // Fetch exchange rate
      try {
        const rateRes = await api().get('/exchange-rate');
        setEurPlnRate(rateRes.data.eur_pln || 0);
      } catch { /* ignore */ }
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [api, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleAccountSelection = (accountId) => {
    setSelectedAccountIds(prev => {
      const next = new Set(prev);
      if (next.has(accountId)) next.delete(accountId); else next.add(accountId);
      return next;
    });
  };

  const toggleAllAccounts = () => {
    if (!data?.accounts) return;
    if (selectedAccountIds.size === data.accounts.length) {
      setSelectedAccountIds(new Set());
    } else {
      setSelectedAccountIds(new Set(data.accounts.map(a => a.id)));
    }
  };

  const selectedBalance = data?.accounts
    ? data.accounts.filter(a => selectedAccountIds.has(a.id)).reduce((sum, a) => {
        const bal = a.current_balance || 0;
        if (a.currency === 'EUR' && eurPlnRate > 0) return sum + bal * eurPlnRate;
        return sum + bal;
      }, 0)
    : (data?.total_balance || 0);

  // Multi-currency breakdown for selected accounts
  const currencyBreakdown = (() => {
    if (!data?.accounts) return { pln: 0, eur: 0, plnIncome: 0, plnExpense: 0, eurIncome: 0, eurExpense: 0 };
    const sel = data.accounts.filter(a => selectedAccountIds.has(a.id));
    return {
      pln: sel.filter(a => a.currency !== 'EUR').reduce((s, a) => s + (a.current_balance || 0), 0),
      eur: sel.filter(a => a.currency === 'EUR').reduce((s, a) => s + (a.current_balance || 0), 0),
      plnIncome: sel.filter(a => a.currency !== 'EUR').reduce((s, a) => s + (a.period_income || 0), 0),
      plnExpense: sel.filter(a => a.currency !== 'EUR').reduce((s, a) => s + (a.period_expense || 0), 0),
      eurIncome: sel.filter(a => a.currency === 'EUR').reduce((s, a) => s + (a.period_income || 0), 0),
      eurExpense: sel.filter(a => a.currency === 'EUR').reduce((s, a) => s + (a.period_expense || 0), 0),
    };
  })();

  // Computed metrics based on selected accounts with EUR conversion
  const selectedIncome = currencyBreakdown.plnIncome + (eurPlnRate > 0 ? currencyBreakdown.eurIncome * eurPlnRate : currencyBreakdown.eurIncome);
  const selectedExpense = currencyBreakdown.plnExpense + (eurPlnRate > 0 ? currencyBreakdown.eurExpense * eurPlnRate : currencyBreakdown.eurExpense);
  const selectedProfit = selectedIncome - selectedExpense;

  const hasEurSelected = currencyBreakdown.eur !== 0 || currencyBreakdown.eurIncome !== 0 || currencyBreakdown.eurExpense !== 0;
  const eurSubtitle = (val, eurVal) => hasEurSelected && eurPlnRate > 0 ? `в т.ч. ${formatCurrency(eurVal, 'EUR')} (×${eurPlnRate})` : undefined;

  const incomeChange = prevData ? getChangePercent(selectedIncome, prevData.total_income) : 0;
  const expenseChange = prevData ? getChangePercent(data?.total_expense || 0, prevData.total_expense) : 0;

  const MetricCard = ({ title, value, icon: Icon, change, isExpense = false, subtitle }) => (
    <Card className="card-hover" data-testid={`metric-${title.toLowerCase().replace(/\s/g, '-')}`}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
        <Icon className={`h-5 w-5 ${isExpense ? 'text-rose-500' : 'text-emerald-500'}`} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-32" />
        ) : (
          <>
            <div className={`text-2xl font-bold font-mono ${isExpense ? 'text-rose-500' : value < 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
              {formatCurrency(value || 0)}
            </div>
            {subtitle && (
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">{subtitle}</p>
            )}
            {change !== undefined && (
              <div className="flex items-center gap-1 mt-1">
                {change >= 0 ? (
                  <ArrowUpRight className={`h-4 w-4 ${isExpense ? 'text-rose-500' : 'text-emerald-500'}`} />
                ) : (
                  <ArrowDownRight className={`h-4 w-4 ${isExpense ? 'text-emerald-500' : 'text-rose-500'}`} />
                )}
                <span className="text-sm text-muted-foreground">
                  {Math.abs(change).toFixed(1)}% к прошлому
                </span>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );

  const directionData = data?.by_direction ? Object.entries(data.by_direction).map(([name, values]) => ({
    name,
    income: values.income,
    expense: values.expense,
    profit: values.profit,
    fill: COLORS[name] || '#6b7280'
  })) : [];

  const incomeCategories = data?.income_by_category ? Object.entries(data.income_by_category).map(([name, value], i) => ({
    name,
    value,
    fill: PIE_COLORS[i % PIE_COLORS.length]
  })) : [];

  const expenseCategories = data?.expense_by_category ? Object.entries(data.expense_by_category).map(([name, value], i) => ({
    name,
    value,
    fill: PIE_COLORS[i % PIE_COLORS.length]
  })) : [];

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Рабочий стол</h1>
          <p className="text-muted-foreground">Обзор финансов вашего бизнеса</p>
        </div>
        
        <div className="flex items-center gap-2 flex-wrap">
          {/* Resolve current period to a YYYY-MM anchor for stepping */}
          {(() => {
            const today = new Date();
            const curYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            let anchor;
            if (/^\d{4}-\d{2}$/.test(period)) anchor = period;
            else if (period === 'current_month') anchor = curYM;
            else if (period === 'prev_month') {
              const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
              anchor = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            }
            // For other presets (year/quarter/all_time) arrows are hidden.
            if (!anchor) return null;
            const shift = (delta) => {
              const [y, m] = anchor.split('-').map(Number);
              const d = new Date(y, m - 1 + delta, 1);
              const ny = d.getFullYear();
              const nm = String(d.getMonth() + 1).padStart(2, '0');
              setPeriod(`${ny}-${nm}`);
            };
            const isFutureBlocked = anchor >= curYM;
            return (
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="bg-card border-border h-9 w-9"
                  onClick={() => shift(-1)}
                  aria-label="Предыдущий месяц"
                  data-testid="period-prev-month"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  className="bg-card border-border h-9 w-9 disabled:opacity-40"
                  onClick={() => shift(1)}
                  disabled={isFutureBlocked}
                  aria-label="Следующий месяц"
                  data-testid="period-next-month"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            );
          })()}

          <Select value={/^\d{4}-\d{2}$/.test(period) ? '__custom__' : period} onValueChange={(v) => { if (v !== '__custom__') setPeriod(v); }} data-testid="period-select">
            <SelectTrigger className="w-48 text-foreground border-border bg-card">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
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
              {/^\d{4}-\d{2}$/.test(period) && (
                <SelectItem value="__custom__" disabled>
                  {format(new Date(period + '-01'), 'LLLL yyyy', { locale: ru })}
                </SelectItem>
              )}
            </SelectContent>
          </Select>

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="bg-card border-border" data-testid="pick-month-btn">
                <Calendar className="h-4 w-4 mr-2" />
                {/^\d{4}-\d{2}$/.test(period)
                  ? format(new Date(period + '-01'), 'LLLL yyyy', { locale: ru })
                  : 'Выбрать месяц'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <CalendarUI
                mode="single"
                selected={/^\d{4}-\d{2}$/.test(period) ? new Date(period + '-01') : undefined}
                onSelect={(d) => { if (d) setPeriod(format(d, 'yyyy-MM')); }}
                locale={ru}
                data-testid="pick-month-calendar"
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          title="Доходы" 
          value={selectedIncome} 
          icon={TrendingUp} 
          change={incomeChange}
          subtitle={eurSubtitle(selectedIncome, currencyBreakdown.eurIncome)}
        />
        <MetricCard 
          title="Расходы" 
          value={selectedExpense} 
          icon={TrendingDown} 
          change={expenseChange}
          isExpense
          subtitle={eurSubtitle(selectedExpense, currencyBreakdown.eurExpense)}
        />
        <MetricCard 
          title="Прибыль" 
          value={selectedProfit} 
          icon={PiggyBank}
        />
        <MetricCard 
          title="Деньги бизнеса" 
          value={selectedBalance} 
          icon={Wallet}
          subtitle={hasEurSelected && eurPlnRate > 0
            ? `${formatCurrency(currencyBreakdown.pln)} + ${formatCurrency(currencyBreakdown.eur, 'EUR')} (×${eurPlnRate})`
            : undefined
          }
        />
      </div>

      {/* Cash Flow With Loans — true monthly result including loan in/out */}
      {data && ((data.loans_received || 0) > 0.005 || (data.loans_repaid || 0) > 0.005) && (
        (() => {
          const received = data.loans_received || 0;
          const repaid = data.loans_repaid || 0;
          const profit = data.profit || 0;
          const cashFlow = data.cash_flow_with_loans ?? (profit + received - repaid);
          return (
            <Card data-testid="cash-flow-loans-card" className={`border-l-4 ${cashFlow >= 0 ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Banknote className="h-5 w-5 text-primary" />
                  Денежный поток с учётом займов
                  <Badge variant="outline" className="text-xs font-normal">
                    прибыль + получено − погашено
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Операционная прибыль</p>
                    <p className={`text-xl font-bold font-mono ${profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {profit >= 0 ? '+' : ''}{formatCurrency(profit)}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">+ Получено по займам</p>
                    <p className="text-xl font-bold font-mono text-sky-300">+{formatCurrency(received)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">− Погашено по займам</p>
                    <p className="text-xl font-bold font-mono text-amber-400">−{formatCurrency(repaid)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Денежный поток</p>
                    <p className={`text-2xl font-bold font-mono ${cashFlow >= 0 ? 'text-emerald-500' : 'text-rose-500'}`} data-testid="cash-flow-loans-value">
                      {cashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow)}
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  {cashFlow >= 0
                    ? 'Сколько реально осталось денег по итогам периода с учётом получения и возврата займов. Если прибыль положительная, но поток отрицательный — заработанное ушло на погашение долга.'
                    : 'Несмотря на прибыль, фактически денег стало меньше: займы выплачены, операционка не покрыла отток. Следите за этой метрикой, чтобы не считать долговые движения настоящим заработком.'}
                </p>

                {/* Per-loan breakdown */}
                {Array.isArray(data.loans_breakdown) && data.loans_breakdown.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-border/40">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">По кредиторам</p>
                    <div className="space-y-2" data-testid="loans-breakdown-list">
                      <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-muted-foreground pb-1 border-b border-border/30">
                        <div className="col-span-4">Кредитор</div>
                        <div className="col-span-3 text-right">Получено</div>
                        <div className="col-span-3 text-right">Погашено</div>
                        <div className="col-span-2 text-right">Чистое влияние</div>
                      </div>
                      {data.loans_breakdown.map((l) => (
                        <div key={l.id} className="grid grid-cols-12 items-center gap-2 text-sm" data-testid={`loan-row-${l.id}`}>
                          <div className="col-span-4 truncate font-medium">{l.name}</div>
                          <div className="col-span-3 text-right font-mono text-sky-300">
                            {l.received > 0 ? `+${formatCurrency(l.received)}` : '—'}
                          </div>
                          <div className="col-span-3 text-right font-mono text-amber-400">
                            {l.repaid > 0 ? `−${formatCurrency(l.repaid)}` : '—'}
                          </div>
                          <div className={`col-span-2 text-right font-mono font-semibold ${l.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            {l.net >= 0 ? '+' : ''}{formatCurrency(l.net)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })()
      )}

      {/* Net Worth (Assets − Liabilities) */}
      {data && (data.assets_balance !== undefined || data.liabilities_balance !== undefined) && (
        (() => {
          const assets = data.assets_balance || 0;
          const liabilities = data.liabilities_balance || 0;
          const netWorth = data.net_worth ?? (assets + liabilities);
          const hasLoans = Math.abs(liabilities) > 0.005;
          if (!hasLoans) return null;  // hide when user has no loan accounts
          return (
            <Card data-testid="net-worth-card" className={`border-l-4 ${netWorth >= 0 ? 'border-l-emerald-500' : 'border-l-rose-500'}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  Чистый капитал
                  <Badge variant="outline" className="text-xs font-normal">
                    активы − займы
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Активы</p>
                    <p className="text-2xl font-bold font-mono text-sky-300">+{formatCurrency(assets)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Займы (долг)</p>
                    <p className="text-2xl font-bold font-mono text-amber-400">{formatCurrency(liabilities)}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">Чистый капитал</p>
                    <p className={`text-2xl font-bold font-mono ${netWorth >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {netWorth >= 0 ? '+' : ''}{formatCurrency(netWorth)}
                    </p>
                  </div>
                </div>
                {netWorth < 0 && (
                  <p className="mt-3 text-xs text-amber-300 flex items-start gap-1.5">
                    <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    Долги сейчас больше, чем имеется на счетах. Это нормально, если бизнес активно растёт за счёт займов, но следите, чтобы тренд месяц-к-месяцу улучшался (см. график «Динамика чистого капитала»).
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })()
      )}
      {runway && (
        <Card data-testid="runway-card" className="border-l-4 border-l-amber-500">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2">
                <Flame className="h-5 w-5 text-amber-500" />
                Runway — на сколько хватит денег
              </CardTitle>
              {runway.fixed_categories_count === 0 ? (
                <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-600 dark:text-amber-400">
                  Отметьте постоянные расходы в Настройках → Статьи
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs">
                  {runway.fixed_categories_count} постоянных статей · база за 3 мес
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Остаток денег</p>
                  <p className="text-2xl font-bold font-mono text-foreground">
                    {formatCurrency(runway.total_balance)}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Постоянные расходы / мес</p>
                  <p className="text-2xl font-bold font-mono text-rose-500">
                    {runway.avg_monthly_burn > 0 ? formatCurrency(runway.avg_monthly_burn) : '—'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Хватит на</p>
                  <p className={`text-2xl font-bold font-mono ${
                    runway.runway_months === null ? 'text-muted-foreground'
                    : runway.runway_months >= 6 ? 'text-emerald-500'
                    : runway.runway_months >= 3 ? 'text-amber-500'
                    : 'text-rose-500'
                  }`}>
                    {runway.runway_months === null ? '∞ месяцев' : `${runway.runway_months} мес`}
                  </p>
                </div>
              </div>
            )}
            {runway.top_categories && runway.top_categories.length > 0 && (
              <div className="mt-4 pt-3 border-t border-border space-y-1">
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Что съедает больше всего (среднее в месяц):
                </p>
                <div className="grid gap-1 md:grid-cols-2">
                  {runway.top_categories.slice(0, 6).map(c => (
                    <div key={c.name} className="flex justify-between text-sm">
                      <span className="text-muted-foreground truncate">{c.name}</span>
                      <span className="font-mono">{formatCurrency(c.avg_monthly)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* FOT + Fixed Costs Widget */}
      {(salarySummary || fixedCostsMonth) && (
        <div className="grid gap-4 md:grid-cols-2">
          {fixedCostsMonth && (
            <Card className="border-l-4 border-l-rose-500" data-testid="fixed-costs-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Repeat className="h-5 w-5 text-rose-500" />
                  Постоянные расходы — {fixedCostsMonth.month}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold font-mono text-rose-500">
                  {formatCurrency(fixedCostsMonth.total)}
                </p>
                {data?.total_income > 0 && fixedCostsMonth.total > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {((fixedCostsMonth.total / data.total_income) * 100).toFixed(1)}% от доходов
                  </p>
                )}
                {fixedCostsMonth.by_category.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border space-y-1">
                    {fixedCostsMonth.by_category.slice(0, 5).map(c => (
                      <div key={c.name} className="flex justify-between text-sm">
                        <span className="text-muted-foreground truncate">{c.name}</span>
                        <span className="font-mono">{formatCurrency(c.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {salarySummary && salarySummary.employees_count > 0 && (
            <Card className="border-l-4 border-l-emerald-500" data-testid="fot-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Banknote className="h-5 w-5 text-emerald-500" />
                  ФОТ — {salarySummary.month}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Начислено</p>
                    <p className="text-xl font-bold font-mono">{formatCurrency(salarySummary.total_accrued)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Выплачено</p>
                    <p className="text-xl font-bold font-mono text-emerald-500">{formatCurrency(salarySummary.total_paid)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground uppercase">Осталось</p>
                    <p className="text-xl font-bold font-mono text-amber-500">{formatCurrency(salarySummary.total_pending)}</p>
                  </div>
                </div>
                {data?.total_income > 0 && salarySummary.total_accrued > 0 && (
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    {((salarySummary.total_accrued / data.total_income) * 100).toFixed(1)}% от доходов · {salarySummary.employees_count} сотрудников
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Balance Chart */}
        <Card className="lg:col-span-2" data-testid="balance-chart">
          <CardHeader>
            <CardTitle>Деньги на счетах</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={dailyBalance}>
                    <defs>
                      <linearGradient id="balanceGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis 
                      dataKey="date" 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(val) => new Date(val).toLocaleDateString('ru', { day: '2-digit', month: 'short' })}
                    />
                    <YAxis 
                      stroke="hsl(var(--muted-foreground))"
                      fontSize={12}
                      tickFormatter={(val) => `${(val / 1000).toFixed(0)}k`}
                    />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(val) => [formatCurrency(val), 'Баланс']}
                      labelFormatter={(val) => new Date(val).toLocaleDateString('ru')}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="balance" 
                      stroke="#3b82f6" 
                      fill="url(#balanceGradient)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Profit by Direction */}
        <Card data-testid="profit-by-direction">
          <CardHeader>
            <CardTitle>Прибыль по направлениям</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={directionData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(val) => formatCurrency(val)}
                    />
                    <Bar dataKey="profit" radius={[4, 4, 0, 0]}>
                      {directionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Accounts — per-period income/expense */}
        <Card data-testid="accounts-card">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Счета за период</CardTitle>
              {data?.accounts?.length > 1 && (
                <button
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={toggleAllAccounts}
                  data-testid="toggle-all-accounts"
                >
                  {selectedAccountIds.size === (data?.accounts?.length || 0) ? 'Снять все' : 'Выбрать все'}
                </button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {data?.accounts?.map((account) => {
                  const isSelected = selectedAccountIds.has(account.id);
                  const hasActivity = (account.period_income || 0) > 0 || (account.period_expense || 0) > 0;
                  return (
                    <div key={account.id}
                      className={`p-3 rounded-lg transition-colors cursor-pointer border ${isSelected ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-transparent opacity-50'}`}
                      onClick={() => toggleAccountSelection(account.id)}
                      data-testid={`account-toggle-${account.id}`}>
                      <div className="flex items-center gap-3 mb-2">
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleAccountSelection(account.id)}
                          className="flex-shrink-0"
                        />
                        <span className="font-medium flex-1">{account.name}</span>
                        <Badge variant="outline" className="text-xs">{account.currency}</Badge>
                        <span className="font-mono text-sm font-semibold">
                          {formatCurrency(account.current_balance, account.currency)}
                        </span>
                      </div>
                      {hasActivity && (
                        <div className="flex gap-4 ml-8 text-xs">
                          <span className="text-emerald-500 font-mono">
                            +{formatCurrency(account.period_income || 0, account.currency)}
                          </span>
                          <span className="text-rose-500 font-mono">
                            -{formatCurrency(account.period_expense || 0, account.currency)}
                          </span>
                          <span className={`font-mono font-semibold ${(account.period_net || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            = {formatCurrency(account.period_net || 0, account.currency)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {(!data?.accounts || data.accounts.length === 0) && (
                  <p className="text-muted-foreground text-center py-4">Нет счетов</p>
                )}

                {/* Selected totals */}
                {data?.accounts?.length > 1 && selectedAccountIds.size > 0 && (
                  <div className="mt-3 pt-3 border-t border-border space-y-1">
                    {/* Per-currency breakdown */}
                    {currencyBreakdown.pln !== 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">PLN:</span>
                        <span className="font-mono font-semibold">{formatCurrency(currencyBreakdown.pln)}</span>
                      </div>
                    )}
                    {currencyBreakdown.eur !== 0 && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">EUR:</span>
                        <span className="font-mono font-semibold">{formatCurrency(currencyBreakdown.eur, 'EUR')}</span>
                      </div>
                    )}
                    {/* Combined total in PLN */}
                    <div className="flex items-center justify-between text-sm pt-1">
                      <span className="text-muted-foreground font-medium">
                        Итого в PLN{eurPlnRate > 0 ? ` (EUR×${eurPlnRate})` : ''}:
                      </span>
                      <span className="font-mono font-bold">{formatCurrency(selectedBalance)}</span>
                    </div>
                    {/* Period income/expense breakdown */}
                    {(() => {
                      const selAccs = (data?.accounts || []).filter(a => selectedAccountIds.has(a.id));
                      const totInc = selAccs.reduce((s, a) => {
                        const inc = a.period_income || 0;
                        return s + (a.currency === 'EUR' && eurPlnRate > 0 ? inc * eurPlnRate : inc);
                      }, 0);
                      const totExp = selAccs.reduce((s, a) => {
                        const exp = a.period_expense || 0;
                        return s + (a.currency === 'EUR' && eurPlnRate > 0 ? exp * eurPlnRate : exp);
                      }, 0);
                      if (totInc === 0 && totExp === 0) return null;
                      return (
                        <div className="flex gap-4 text-xs mt-1">
                          <span className="text-emerald-500 font-mono">+{formatCurrency(totInc)}</span>
                          <span className="text-rose-500 font-mono">-{formatCurrency(totExp)}</span>
                          <span className={`font-mono font-semibold ${(totInc - totExp) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                            = {formatCurrency(totInc - totExp)}
                          </span>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Structure Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="income-structure">
          <CardHeader>
            <CardTitle>Структура доходов</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : incomeCategories.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={incomeCategories}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {incomeCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatCurrency(val)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Нет данных</p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="expense-structure">
          <CardHeader>
            <CardTitle>Структура расходов</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : expenseCategories.length > 0 ? (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseCategories}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {expenseCategories.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatCurrency(val)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Нет данных</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming Payments */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="upcoming-payments">
          <CardHeader>
            <CardTitle>Ближайшие платежи</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : data?.upcoming_payments?.length > 0 ? (
              <div className="space-y-3">
                {data.upcoming_payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${payment.type === 'income' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                      <div>
                        <p className="font-medium">{payment.category_name || 'Без категории'}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(payment.date).toLocaleDateString('ru')}
                          {payment.contractor_name && ` • ${payment.contractor_name}`}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-mono font-semibold ${payment.type === 'income' ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {payment.type === 'income' ? '+' : '-'}{formatCurrency(payment.amount, payment.currency)}
                      </p>
                      {payment.direction_name && (
                        <Badge variant="outline" className={`text-xs ${getDirectionClass(payment.direction_name)}`}>
                          {payment.direction_name}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">Нет запланированных платежей</p>
            )}
          </CardContent>
        </Card>

        {/* Top Contractors */}
        <Card data-testid="top-contractors">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Топ контрагентов
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : topContractors.length > 0 ? (
              <div className="space-y-3">
                {topContractors.map((contractor, idx) => (
                  <div key={contractor.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="font-medium">{contractor.name}</p>
                        <p className="text-xs text-muted-foreground">{contractor.transactions} операций</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {contractor.income > 0 && (
                        <p className="font-mono text-sm text-emerald-500">+{formatCurrency(contractor.income)}</p>
                      )}
                      {contractor.expense > 0 && (
                        <p className="font-mono text-sm text-rose-500">-{formatCurrency(contractor.expense)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">Нет данных о контрагентах</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default DashboardPage;
