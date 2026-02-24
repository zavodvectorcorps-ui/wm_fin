import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Progress } from '../components/ui/progress';
import { 
  TrendingDown, Calendar, PiggyBank, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { formatCurrency, getDirectionClass, getPeriodDates, getChangePercent } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';

const PIE_COLORS = ['#3b82f6', '#ef4444', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1', '#22c55e', '#06b6d4'];

export const ExpenseAnalysisPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('current_month');
  const [directionId, setDirectionId] = useState('all');
  const [data, setData] = useState(null);
  const [prevData, setPrevData] = useState(null);
  const [directions, setDirections] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dates = getPeriodDates(period);
      const prevDates = getPeriodDates('prev_month');
      
      const params = { date_from: dates.from, date_to: dates.to };
      const prevParams = { date_from: prevDates.from, date_to: prevDates.to };
      
      if (directionId !== 'all') {
        params.direction_id = directionId;
        prevParams.direction_id = directionId;
      }
      
      const [summaryRes, prevSummaryRes, directionsRes] = await Promise.all([
        api().get('/analytics/summary', { params }),
        api().get('/analytics/summary', { params: prevParams }),
        api().get('/directions')
      ]);
      
      setData(summaryRes.data);
      setPrevData(prevSummaryRes.data);
      setDirections(directionsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [api, period, directionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const expenseCategories = data?.expense_by_category 
    ? Object.entries(data.expense_by_category)
        .map(([name, value], i) => ({ name, value, fill: PIE_COLORS[i % PIE_COLORS.length] }))
        .sort((a, b) => b.value - a.value)
    : [];

  const totalExpense = data?.total_expense || 0;
  const prevTotalExpense = prevData?.total_expense || 0;
  const expenseChange = getChangePercent(totalExpense, prevTotalExpense);

  // Calculate expense by direction
  const expenseByDirection = data?.by_direction
    ? Object.entries(data.by_direction).map(([name, values]) => ({
        name,
        expense: values.expense,
        fill: name === 'Теплицы' ? '#3b82f6' : name === 'Сауны' ? '#f97316' : name === 'Купели' ? '#22c55e' : '#6b7280'
      }))
    : [];

  // Top 5 expenses with growth indicators
  const topExpenses = expenseCategories.slice(0, 10).map(cat => {
    const prevValue = prevData?.expense_by_category?.[cat.name] || 0;
    const change = getChangePercent(cat.value, prevValue);
    return { ...cat, prevValue, change };
  });

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Анализ расходов</h1>
          <p className="text-muted-foreground">Детальный анализ структуры затрат</p>
        </div>
        
        <div className="flex gap-2">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-40" data-testid="period-select">
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
          
          <Select value={directionId} onValueChange={setDirectionId}>
            <SelectTrigger className="w-48" data-testid="direction-select">
              <SelectValue placeholder="Все направления" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все направления</SelectItem>
              {directions.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card data-testid="total-expense-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Всего расходов</CardTitle>
            <TrendingDown className="h-5 w-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className="text-2xl font-bold font-mono text-rose-500">
                  {formatCurrency(totalExpense)}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  {expenseChange >= 0 ? (
                    <ArrowUpRight className="h-4 w-4 text-rose-500" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-emerald-500" />
                  )}
                  <span className="text-sm text-muted-foreground">
                    {Math.abs(expenseChange).toFixed(1)}% к прошлому периоду
                  </span>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card data-testid="avg-expense-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Категорий расходов</CardTitle>
            <PiggyBank className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono">
                {expenseCategories.length}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="top-expense-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Топ статья расходов</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : topExpenses.length > 0 ? (
              <>
                <div className="text-lg font-bold truncate">{topExpenses[0]?.name}</div>
                <div className="text-xl font-mono text-rose-500">{formatCurrency(topExpenses[0]?.value || 0)}</div>
              </>
            ) : (
              <div className="text-muted-foreground">Нет данных</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pie Chart */}
        <Card data-testid="expense-pie">
          <CardHeader>
            <CardTitle>Структура расходов</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : expenseCategories.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseCategories.slice(0, 8)}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {expenseCategories.slice(0, 8).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatCurrency(val)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Нет данных о расходах
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bar Chart by Direction */}
        <Card data-testid="expense-by-direction">
          <CardHeader>
            <CardTitle>Расходы по направлениям</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : expenseByDirection.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={expenseByDirection}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(val) => formatCurrency(val)} />
                    <Bar dataKey="expense" name="Расходы" radius={[4, 4, 0, 0]}>
                      {expenseByDirection.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                Нет данных
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Expenses Table */}
      <Card data-testid="top-expenses-table">
        <CardHeader>
          <CardTitle>Топ статей расходов</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : topExpenses.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Статья</TableHead>
                  <TableHead className="text-right">Сумма</TableHead>
                  <TableHead className="text-right">% от расходов</TableHead>
                  <TableHead className="text-right">Изменение</TableHead>
                  <TableHead className="w-32">Доля</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topExpenses.map((cat, i) => {
                  const percent = totalExpense > 0 ? (cat.value / totalExpense) * 100 : 0;
                  return (
                    <TableRow key={cat.name}>
                      <TableCell className="font-medium text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{cat.name}</TableCell>
                      <TableCell className="text-right font-mono text-rose-500">
                        {formatCurrency(cat.value)}
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {percent.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right">
                        <div className={`flex items-center justify-end gap-1 ${cat.change >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {cat.change >= 0 ? (
                            <ArrowUpRight className="h-4 w-4" />
                          ) : (
                            <ArrowDownRight className="h-4 w-4" />
                          )}
                          <span className="font-mono">{Math.abs(cat.change).toFixed(0)}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Progress value={percent} className="h-2 [&>div]:bg-rose-500" />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-muted-foreground">
              Нет данных о расходах за выбранный период
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alerts for high growth */}
      {!loading && topExpenses.some(e => e.change > 30) && (
        <Card className="border-yellow-500/50 bg-yellow-500/5" data-testid="expense-alerts">
          <CardHeader>
            <CardTitle className="text-yellow-500">Требует внимания</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {topExpenses.filter(e => e.change > 30).map(exp => (
                <div key={exp.name} className="flex items-center justify-between p-2 rounded-lg bg-background">
                  <span className="font-medium">{exp.name}</span>
                  <Badge variant="destructive">+{exp.change.toFixed(0)}% роста</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ExpenseAnalysisPage;
