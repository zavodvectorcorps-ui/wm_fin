import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Progress } from '../components/ui/progress';
import { 
  TrendingUp, TrendingDown, Calendar, Building2
} from 'lucide-react';
import { formatCurrency, getDirectionClass, getPeriodDates } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell } from 'recharts';

const DIRECTION_COLORS = {
  'Теплицы': '#3b82f6',
  'Сауны': '#f97316',
  'Купели': '#22c55e',
  'Общее': '#6b7280'
};

export const ProfitabilityPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('current_month');
  const [data, setData] = useState(null);
  const [directions, setDirections] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dates = getPeriodDates(period);
      
      const [summaryRes, directionsRes] = await Promise.all([
        api().get('/analytics/summary', { params: { date_from: dates.from, date_to: dates.to } }),
        api().get('/directions')
      ]);
      
      setData(summaryRes.data);
      setDirections(directionsRes.data);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  }, [api, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const directionData = data?.by_direction 
    ? Object.entries(data.by_direction).map(([name, values]) => ({
        name,
        income: values.income,
        expense: values.expense,
        profit: values.profit,
        profitability: values.income > 0 ? ((values.profit / values.income) * 100) : 0,
        fill: DIRECTION_COLORS[name] || '#6b7280'
      }))
    : [];

  const totalIncome = data?.total_income || 0;
  const totalExpense = data?.total_expense || 0;
  const totalProfit = totalIncome - totalExpense;
  const totalProfitability = totalIncome > 0 ? ((totalProfit / totalIncome) * 100) : 0;

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

      {/* Summary Card */}
      <Card data-testid="total-profitability">
        <CardHeader>
          <CardTitle>Общая рентабельность</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid gap-6 md:grid-cols-4">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Выручка</p>
                <p className="text-2xl font-bold font-mono text-emerald-500">{formatCurrency(totalIncome)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Расходы</p>
                <p className="text-2xl font-bold font-mono text-rose-500">{formatCurrency(totalExpense)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Прибыль</p>
                <p className={`text-2xl font-bold font-mono ${totalProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {formatCurrency(totalProfit)}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-1">Рентабельность</p>
                <p className={`text-2xl font-bold font-mono ${totalProfitability >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>
                  {totalProfitability.toFixed(1)}%
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Chart */}
      <Card data-testid="profitability-chart">
        <CardHeader>
          <CardTitle>Сравнение направлений</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-80 w-full" />
          ) : directionData.length > 0 ? (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={directionData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <YAxis type="category" dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} width={100} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(val) => formatCurrency(val)}
                  />
                  <Legend />
                  <Bar dataKey="income" name="Доходы" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="expense" name="Расходы" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-80 flex items-center justify-center text-muted-foreground">
              Нет данных за выбранный период
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Table */}
      <Card data-testid="profitability-table">
        <CardHeader>
          <CardTitle>Детализация по направлениям</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Направление</TableHead>
                  <TableHead className="text-right">Выручка</TableHead>
                  <TableHead className="text-right">Расходы</TableHead>
                  <TableHead className="text-right">Прибыль</TableHead>
                  <TableHead className="text-right">Рентабельность</TableHead>
                  <TableHead className="w-32">Прогресс</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {directionData.map((dir) => (
                  <TableRow key={dir.name}>
                    <TableCell>
                      <Badge variant="outline" className={getDirectionClass(dir.name)}>
                        {dir.name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-500">
                      {formatCurrency(dir.income)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-rose-500">
                      {formatCurrency(dir.expense)}
                    </TableCell>
                    <TableCell className={`text-right font-mono ${dir.profit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {formatCurrency(dir.profit)}
                    </TableCell>
                    <TableCell className={`text-right font-mono font-bold ${dir.profitability >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>
                      {dir.profitability.toFixed(1)}%
                    </TableCell>
                    <TableCell>
                      <Progress 
                        value={Math.min(100, Math.abs(dir.profitability))} 
                        className={`h-2 ${dir.profitability >= 0 ? '' : '[&>div]:bg-rose-500'}`}
                      />
                    </TableCell>
                  </TableRow>
                ))}
                
                {/* Total row */}
                <TableRow className="font-bold border-t-2">
                  <TableCell>Итого</TableCell>
                  <TableCell className="text-right font-mono text-emerald-500">
                    {formatCurrency(totalIncome)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-rose-500">
                    {formatCurrency(totalExpense)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${totalProfit >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {formatCurrency(totalProfit)}
                  </TableCell>
                  <TableCell className={`text-right font-mono ${totalProfitability >= 0 ? 'text-blue-500' : 'text-rose-500'}`}>
                    {totalProfitability.toFixed(1)}%
                  </TableCell>
                  <TableCell></TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Insights */}
      {!loading && directionData.length > 0 && (
        <Card data-testid="insights">
          <CardHeader>
            <CardTitle>Выводы</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {(() => {
                const bestDir = directionData.reduce((a, b) => a.profitability > b.profitability ? a : b);
                const worstDir = directionData.reduce((a, b) => a.profitability < b.profitability ? a : b);
                const topRevenue = directionData.reduce((a, b) => a.income > b.income ? a : b);
                
                return (
                  <>
                    {bestDir.profitability > 0 && (
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                        <TrendingUp className="h-5 w-5 text-emerald-500 mt-0.5" />
                        <div>
                          <p className="font-medium text-emerald-500">Самое прибыльное направление</p>
                          <p className="text-sm text-muted-foreground">
                            <strong>{bestDir.name}</strong> с рентабельностью {bestDir.profitability.toFixed(1)}%
                          </p>
                        </div>
                      </div>
                    )}
                    
                    {worstDir.profitability < bestDir.profitability && (
                      <div className="flex items-start gap-3 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                        <TrendingDown className="h-5 w-5 text-yellow-500 mt-0.5" />
                        <div>
                          <p className="font-medium text-yellow-500">Требует внимания</p>
                          <p className="text-sm text-muted-foreground">
                            <strong>{worstDir.name}</strong> — рентабельность {worstDir.profitability.toFixed(1)}%
                            {worstDir.profitability < 0 && ' (убыточное направление)'}
                          </p>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex items-start gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                      <Building2 className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div>
                        <p className="font-medium text-blue-500">Основной источник выручки</p>
                        <p className="text-sm text-muted-foreground">
                          <strong>{topRevenue.name}</strong> — {formatCurrency(topRevenue.income)} 
                          ({totalIncome > 0 ? ((topRevenue.income / totalIncome) * 100).toFixed(0) : 0}% от общей выручки)
                        </p>
                      </div>
                    </div>
                  </>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProfitabilityPage;
