import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Progress } from '../components/ui/progress';
import { 
  TrendingDown, Calendar, Layers, Users, BarChart3
} from 'lucide-react';
import { formatCurrency, getPeriodDates, getDirectionClass } from '../lib/utils';
import { 
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6', '#8b5cf6'];

const DIRECTION_COLORS = {
  'Теплицы': '#3b82f6',
  'Сауны': '#f97316',
  'Купели': '#22c55e',
  'Общее': '#6b7280'
};

export const ExpenseAnalysisPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('current_month');
  const [directionId, setDirectionId] = useState('all');
  const [directions, setDirections] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dates = getPeriodDates(period);
      const params = { date_from: dates.from, date_to: dates.to };
      if (directionId !== 'all') params.direction_id = directionId;
      
      const [analysisRes, directionsRes] = await Promise.all([
        api().get('/analytics/expense-analysis', { params }),
        api().get('/directions')
      ]);
      
      setData(analysisRes.data);
      setDirections(directionsRes.data);
    } catch (error) {
      console.error('Failed to fetch expense analysis:', error);
    } finally {
      setLoading(false);
    }
  }, [api, period, directionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const categoryPieData = data?.by_category?.slice(0, 8).map((cat, i) => ({
    name: cat.name,
    value: cat.amount,
    fill: COLORS[i % COLORS.length]
  })) || [];

  const directionData = data?.by_direction?.map(dir => ({
    name: dir.name,
    amount: dir.amount,
    fill: DIRECTION_COLORS[dir.name] || '#6b7280'
  })) || [];

  const trendData = data?.daily_trend?.map(d => ({
    date: d.date,
    amount: d.amount
  })) || [];

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Анализ расходов</h1>
          <p className="text-muted-foreground">Детальная аналитика расходов</p>
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
            <SelectTrigger className="w-40" data-testid="direction-select">
              <SelectValue placeholder="Направление" />
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
        <Card className="card-hover" data-testid="total-expense">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Всего расходов</CardTitle>
            <TrendingDown className="h-5 w-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono text-rose-500">
                {formatCurrency(data?.total_expense || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="daily-average">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">В среднем в день</CardTitle>
            <Calendar className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono">
                {formatCurrency(data?.daily_average || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="transaction-count">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Операций</CardTitle>
            <Layers className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono">
                {data?.transaction_count || 0}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="top-category">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Топ категория</CardTitle>
            <BarChart3 className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div>
                <div className="text-lg font-semibold truncate">{data?.by_category?.[0]?.name || '-'}</div>
                <p className="text-sm text-muted-foreground">{data?.by_category?.[0]?.percent?.toFixed(1) || 0}% от всех расходов</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Expense Trend */}
        <Card className="lg:col-span-2" data-testid="expense-trend">
          <CardHeader>
            <CardTitle>Динамика расходов</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : trendData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
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
                      formatter={(val) => [formatCurrency(val), 'Расходы']}
                      labelFormatter={(val) => new Date(val).toLocaleDateString('ru')}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#ef4444" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">Нет данных за период</p>
            )}
          </CardContent>
        </Card>

        {/* By Category */}
        <Card data-testid="by-category">
          <CardHeader>
            <CardTitle>По категориям</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : categoryPieData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryPieData.map((entry, index) => (
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

        {/* By Direction */}
        <Card data-testid="by-direction">
          <CardHeader>
            <CardTitle>По направлениям</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-64 w-full" />
            ) : directionData.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={directionData} layout="vertical">
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
                    <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                      {directionData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
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
      </div>

      {/* Detailed Tables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Categories Table */}
        <Card data-testid="categories-table">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Категории расходов
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : data?.by_category?.length > 0 ? (
              <div className="space-y-3">
                {data.by_category.map((cat, idx) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium truncate max-w-[200px]">{cat.name}</span>
                      <span className="font-mono text-rose-500">{formatCurrency(cat.amount)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Progress value={cat.percent} className="h-2 flex-1" />
                      <span className="text-xs text-muted-foreground w-12">{cat.percent.toFixed(1)}%</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">Нет данных</p>
            )}
          </CardContent>
        </Card>

        {/* Top Contractors Table */}
        <Card data-testid="contractors-table">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Топ контрагентов
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : data?.top_contractors?.length > 0 ? (
              <div className="space-y-2">
                {data.top_contractors.map((contractor, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                        {idx + 1}
                      </span>
                      <span className="font-medium truncate max-w-[180px]">{contractor.name}</span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono text-rose-500">{formatCurrency(contractor.amount)}</span>
                      <p className="text-xs text-muted-foreground">{contractor.count} операций</p>
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

export default ExpenseAnalysisPage;
