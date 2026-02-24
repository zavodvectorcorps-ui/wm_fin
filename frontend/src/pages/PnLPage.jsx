import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Input } from '../components/ui/input';
import { 
  TrendingUp, TrendingDown, Calculator, Calendar
} from 'lucide-react';
import { formatCurrency, getDirectionClass, getPeriodDates } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const PIE_COLORS = ['#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#f59e0b', '#6366f1'];

export const PnLPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('current_month');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [directionId, setDirectionId] = useState('all');
  const [data, setData] = useState(null);
  const [directions, setDirections] = useState([]);

  useEffect(() => {
    const dates = getPeriodDates(period);
    setDateFrom(dates.from);
    setDateTo(dates.to);
  }, [period]);

  const fetchData = useCallback(async () => {
    if (!dateFrom || !dateTo) return;
    
    setLoading(true);
    try {
      const params = { date_from: dateFrom, date_to: dateTo };
      if (directionId !== 'all') params.direction_id = directionId;
      
      const [pnlRes, directionsRes] = await Promise.all([
        api().get('/analytics/pnl', { params }),
        api().get('/directions')
      ]);
      
      setData(pnlRes.data);
      setDirections(directionsRes.data);
    } catch (error) {
      console.error('Failed to fetch P&L data:', error);
    } finally {
      setLoading(false);
    }
  }, [api, dateFrom, dateTo, directionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const incomeChartData = data?.income?.groups 
    ? Object.entries(data.income.groups).map(([name, values], i) => ({
        name,
        value: values.total,
        fill: PIE_COLORS[i % PIE_COLORS.length]
      })).filter(d => d.value > 0)
    : [];

  const expenseChartData = data?.expense?.groups
    ? Object.entries(data.expense.groups).map(([name, values], i) => ({
        name,
        value: values.total,
        fill: PIE_COLORS[i % PIE_COLORS.length]
      })).filter(d => d.value > 0)
    : [];

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Прибыли и убытки</h1>
          <p className="text-muted-foreground">P&L отчёт по статьям</p>
        </div>
        
        <div className="flex gap-2 flex-wrap">
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
              <SelectItem value="custom">Произвольный</SelectItem>
            </SelectContent>
          </Select>

          {period === 'custom' && (
            <>
              <Input 
                type="date" 
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-36"
              />
              <Input 
                type="date" 
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-36"
              />
            </>
          )}
          
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
      <div className="grid gap-4 md:grid-cols-4">
        <Card data-testid="total-income-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Выручка</CardTitle>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono text-emerald-500">
                {formatCurrency(data?.income?.total || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="total-expense-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Расходы</CardTitle>
            <TrendingDown className="h-5 w-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono text-rose-500">
                {formatCurrency(data?.expense?.total || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="gross-profit-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Валовая прибыль</CardTitle>
            <Calculator className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className={`text-2xl font-bold font-mono ${(data?.gross_profit || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {formatCurrency(data?.gross_profit || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="net-profit-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Чистая прибыль</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <>
                <div className={`text-2xl font-bold font-mono ${(data?.net_profit || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {formatCurrency(data?.net_profit || 0)}
                </div>
                {data?.income?.total > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Рентабельность: {((data?.net_profit / data?.income?.total) * 100).toFixed(1)}%
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card data-testid="income-structure">
          <CardHeader>
            <CardTitle>Структура доходов</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : incomeChartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={incomeChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {incomeChartData.map((entry, index) => (
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
                Нет данных о доходах
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="expense-structure">
          <CardHeader>
            <CardTitle>Структура расходов</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : expenseChartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {expenseChartData.map((entry, index) => (
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
      </div>

      {/* Detailed Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Income Table */}
        <Card data-testid="income-detail">
          <CardHeader>
            <CardTitle className="text-emerald-500">Доходы</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Группа / Статья</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.income?.groups && Object.entries(data.income.groups).map(([group, values]) => (
                    <React.Fragment key={group}>
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell>{group}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(values.total)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {data?.income?.total > 0 ? ((values.total / data.income.total) * 100).toFixed(1) : 0}%
                        </TableCell>
                      </TableRow>
                      {Object.entries(values.items || {}).filter(([_, v]) => v > 0).map(([item, amount]) => (
                        <TableRow key={item}>
                          <TableCell className="pl-8 text-muted-foreground">{item}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(amount)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {data?.income?.total > 0 ? ((amount / data.income.total) * 100).toFixed(1) : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Итого доходов</TableCell>
                    <TableCell className="text-right font-mono text-emerald-500">
                      {formatCurrency(data?.income?.total || 0)}
                    </TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Expense Table */}
        <Card data-testid="expense-detail">
          <CardHeader>
            <CardTitle className="text-rose-500">Расходы</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Группа / Статья</TableHead>
                    <TableHead className="text-right">Сумма</TableHead>
                    <TableHead className="text-right">%</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.expense?.groups && Object.entries(data.expense.groups).map(([group, values]) => (
                    <React.Fragment key={group}>
                      <TableRow className="bg-muted/30 font-medium">
                        <TableCell>{group}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(values.total)}</TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {data?.expense?.total > 0 ? ((values.total / data.expense.total) * 100).toFixed(1) : 0}%
                        </TableCell>
                      </TableRow>
                      {Object.entries(values.items || {}).filter(([_, v]) => v > 0).map(([item, amount]) => (
                        <TableRow key={item}>
                          <TableCell className="pl-8 text-muted-foreground">{item}</TableCell>
                          <TableCell className="text-right font-mono">{formatCurrency(amount)}</TableCell>
                          <TableCell className="text-right text-muted-foreground">
                            {data?.expense?.total > 0 ? ((amount / data.expense.total) * 100).toFixed(1) : 0}%
                          </TableCell>
                        </TableRow>
                      ))}
                    </React.Fragment>
                  ))}
                  <TableRow className="font-bold border-t-2">
                    <TableCell>Итого расходов</TableCell>
                    <TableCell className="text-right font-mono text-rose-500">
                      {formatCurrency(data?.expense?.total || 0)}
                    </TableCell>
                    <TableCell className="text-right">100%</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Profit Summary */}
      <Card data-testid="profit-summary">
        <CardHeader>
          <CardTitle>Итоговый результат</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">Выручка</TableCell>
                <TableCell className="text-right font-mono text-emerald-500 text-lg">
                  {formatCurrency(data?.income?.total || 0)}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="font-medium">Расходы</TableCell>
                <TableCell className="text-right font-mono text-rose-500 text-lg">
                  -{formatCurrency(data?.expense?.total || 0)}
                </TableCell>
              </TableRow>
              <TableRow className="border-t-2">
                <TableCell className="font-bold text-lg">Чистая прибыль</TableCell>
                <TableCell className={`text-right font-mono font-bold text-xl ${(data?.net_profit || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {formatCurrency(data?.net_profit || 0)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default PnLPage;
