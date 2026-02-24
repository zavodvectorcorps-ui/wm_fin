import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { 
  TrendingUp, TrendingDown, Wallet, PiggyBank, 
  ArrowUpRight, ArrowDownRight, Calendar
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

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dates = getPeriodDates(period);
      const prevDates = getPeriodDates('prev_month');
      
      const [summaryRes, dailyRes, prevSummaryRes] = await Promise.all([
        api().get('/analytics/summary', { params: { date_from: dates.from, date_to: dates.to } }),
        api().get('/analytics/daily-balance', { params: { date_from: dates.from, date_to: dates.to } }),
        api().get('/analytics/summary', { params: { date_from: prevDates.from, date_to: prevDates.to } })
      ]);
      
      setData(summaryRes.data);
      setDailyBalance(dailyRes.data);
      setPrevData(prevSummaryRes.data);
    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [api, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const incomeChange = prevData ? getChangePercent(data?.total_income || 0, prevData.total_income) : 0;
  const expenseChange = prevData ? getChangePercent(data?.total_expense || 0, prevData.total_expense) : 0;

  const MetricCard = ({ title, value, icon: Icon, change, isExpense = false }) => (
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
        
        <Select value={period} onValueChange={setPeriod} data-testid="period-select">
          <SelectTrigger className="w-48">
            <Calendar className="h-4 w-4 mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="current_month">Текущий месяц</SelectItem>
            <SelectItem value="prev_month">Прошлый месяц</SelectItem>
            <SelectItem value="quarter">Квартал</SelectItem>
            <SelectItem value="year">Год</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Metric Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard 
          title="Доходы" 
          value={data?.total_income} 
          icon={TrendingUp} 
          change={incomeChange}
        />
        <MetricCard 
          title="Расходы" 
          value={data?.total_expense} 
          icon={TrendingDown} 
          change={expenseChange}
          isExpense
        />
        <MetricCard 
          title="Прибыль" 
          value={data?.profit} 
          icon={PiggyBank}
        />
        <MetricCard 
          title="Деньги бизнеса" 
          value={data?.total_balance} 
          icon={Wallet}
        />
      </div>

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

        {/* Accounts */}
        <Card data-testid="accounts-card">
          <CardHeader>
            <CardTitle>Счета</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-3">
                {[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="space-y-3">
                {data?.accounts?.map((account) => (
                  <div key={account.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{account.name}</p>
                      <p className="text-sm text-muted-foreground">{account.currency}</p>
                    </div>
                    <span className="font-mono font-semibold">
                      {formatCurrency(account.current_balance, account.currency)}
                    </span>
                  </div>
                ))}
                {(!data?.accounts || data.accounts.length === 0) && (
                  <p className="text-muted-foreground text-center py-4">Нет счетов</p>
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
    </div>
  );
};

export default DashboardPage;
