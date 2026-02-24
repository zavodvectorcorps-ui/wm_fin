import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Progress } from '../components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { 
  TrendingUp, TrendingDown, Calendar, Percent, BarChart3
} from 'lucide-react';
import { formatCurrency, getPeriodDates } from '../lib/utils';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';

const DIRECTION_COLORS = {
  'Теплицы': '#3b82f6',
  'Сауны': '#f97316',
  'Купели': '#22c55e',
  'Общее': '#6b7280'
};

export const ProfitabilityPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('current_month');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dates = getPeriodDates(period);
      const res = await api().get('/analytics/profitability', { 
        params: { date_from: dates.from, date_to: dates.to } 
      });
      setData(res.data);
    } catch (error) {
      console.error('Failed to fetch profitability data:', error);
    } finally {
      setLoading(false);
    }
  }, [api, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartData = data?.by_direction?.map(dir => ({
    name: dir.name,
    income: dir.income,
    expense: dir.expense,
    profit: dir.profit,
    fill: DIRECTION_COLORS[dir.name] || '#6b7280'
  })) || [];

  const marginData = data?.by_direction?.map(dir => ({
    name: dir.name,
    margin: Math.max(0, dir.margin),
    fill: DIRECTION_COLORS[dir.name] || '#6b7280'
  })) || [];

  const getMarginColor = (margin) => {
    if (margin >= 30) return 'text-emerald-500';
    if (margin >= 15) return 'text-yellow-500';
    if (margin >= 0) return 'text-orange-500';
    return 'text-rose-500';
  };

  const getMarginBadge = (margin) => {
    if (margin >= 30) return { label: 'Высокая', variant: 'default', className: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' };
    if (margin >= 15) return { label: 'Средняя', variant: 'default', className: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' };
    if (margin >= 0) return { label: 'Низкая', variant: 'default', className: 'bg-orange-500/10 text-orange-500 border-orange-500/20' };
    return { label: 'Убыток', variant: 'destructive', className: 'bg-rose-500/10 text-rose-500 border-rose-500/20' };
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Рентабельность</h1>
          <p className="text-muted-foreground">Анализ прибыльности по направлениям бизнеса</p>
        </div>
        
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger className="w-48" data-testid="period-select">
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

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="card-hover" data-testid="total-income">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Выручка</CardTitle>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono text-emerald-500">
                {formatCurrency(data?.totals?.income || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="total-expense">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Расходы</CardTitle>
            <TrendingDown className="h-5 w-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono text-rose-500">
                {formatCurrency(data?.totals?.expense || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="total-profit">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Прибыль</CardTitle>
            <BarChart3 className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className={`text-2xl font-bold font-mono ${(data?.totals?.profit || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {formatCurrency(data?.totals?.profit || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="overall-margin">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Маржа</CardTitle>
            <Percent className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className={`text-2xl font-bold font-mono ${getMarginColor(data?.totals?.margin || 0)}`}>
                {(data?.totals?.margin || 0).toFixed(1)}%
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Income vs Expense by Direction */}
        <Card className="lg:col-span-2" data-testid="income-expense-chart">
          <CardHeader>
            <CardTitle>Доходы и расходы по направлениям</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
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
                    <Legend />
                    <Bar dataKey="income" name="Доходы" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expense" name="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Нет данных за период</p>
            )}
          </CardContent>
        </Card>

        {/* Profit by Direction */}
        <Card data-testid="profit-chart">
          <CardHeader>
            <CardTitle>Прибыль по направлениям</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : chartData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={80} />
                    <Tooltip 
                      contentStyle={{ 
                        backgroundColor: 'hsl(var(--popover))', 
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                      formatter={(val) => formatCurrency(val)}
                    />
                    <Bar dataKey="profit" name="Прибыль" radius={[0, 4, 4, 0]}>
                      {chartData.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={entry.profit >= 0 ? '#22c55e' : '#ef4444'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Нет данных</p>
            )}
          </CardContent>
        </Card>

        {/* Margin by Direction */}
        <Card data-testid="margin-chart">
          <CardHeader>
            <CardTitle>Маржинальность направлений</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : marginData.length > 0 ? (
              <div className="space-y-4">
                {marginData.map((dir, idx) => (
                  <div key={idx} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: dir.fill }} />
                        <span className="font-medium">{dir.name}</span>
                      </div>
                      <span className={`font-mono font-bold ${getMarginColor(dir.margin)}`}>
                        {dir.margin.toFixed(1)}%
                      </span>
                    </div>
                    <Progress 
                      value={Math.min(dir.margin, 100)} 
                      className="h-3"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Нет данных</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detailed Table */}
      <Card data-testid="profitability-table">
        <CardHeader>
          <CardTitle>Детализация по направлениям</CardTitle>
          <CardDescription>Полная финансовая картина каждого направления</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : data?.by_direction?.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Направление</TableHead>
                  <TableHead className="text-right">Доходы</TableHead>
                  <TableHead className="text-right">Расходы</TableHead>
                  <TableHead className="text-right">Прибыль</TableHead>
                  <TableHead className="text-right">Маржа</TableHead>
                  <TableHead className="text-right">Операции</TableHead>
                  <TableHead>Оценка</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.by_direction.map((dir, idx) => {
                  const badge = getMarginBadge(dir.margin);
                  return (
                    <TableRow key={idx}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: DIRECTION_COLORS[dir.name] || '#6b7280' }} 
                          />
                          <span className="font-medium">{dir.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-emerald-500">
                        {formatCurrency(dir.income)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-rose-500">
                        {formatCurrency(dir.expense)}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${dir.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {formatCurrency(dir.profit)}
                      </TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${getMarginColor(dir.margin)}`}>
                        {dir.margin.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {dir.transactions}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={badge.className}>
                          {badge.label}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground text-center py-8">Нет данных за выбранный период</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ProfitabilityPage;
