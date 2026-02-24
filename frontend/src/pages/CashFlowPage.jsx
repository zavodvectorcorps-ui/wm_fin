import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { 
  TrendingUp, TrendingDown, Calendar
} from 'lucide-react';
import { formatCurrency, getDirectionClass } from '../lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

const MONTHS_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

export const CashFlowPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [directionId, setDirectionId] = useState('all');
  const [data, setData] = useState(null);
  const [directions, setDirections] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { year };
      if (directionId !== 'all') params.direction_id = directionId;
      
      const [cashflowRes, directionsRes] = await Promise.all([
        api().get('/analytics/cashflow', { params }),
        api().get('/directions')
      ]);
      
      setData(cashflowRes.data);
      setDirections(directionsRes.data);
    } catch (error) {
      console.error('Failed to fetch cash flow data:', error);
    } finally {
      setLoading(false);
    }
  }, [api, year, directionId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const chartData = data?.months?.map((m, i) => ({
    month: MONTHS_RU[i],
    'Доходы': m.income,
    'Расходы': m.expense,
    'Чистый поток': m.net
  })) || [];

  // Get all unique categories from all months
  const allCategories = new Set();
  data?.months?.forEach(m => {
    Object.keys(m.by_category || {}).forEach(cat => allCategories.add(cat));
  });
  const categories = Array.from(allCategories);

  const years = [];
  const currentYear = new Date().getFullYear();
  for (let y = currentYear; y >= currentYear - 5; y--) {
    years.push(y);
  }

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Движение средств</h1>
          <p className="text-muted-foreground">Cash Flow отчёт по месяцам</p>
        </div>
        
        <div className="flex gap-2">
          <Select value={year.toString()} onValueChange={(v) => setYear(parseInt(v))}>
            <SelectTrigger className="w-32" data-testid="year-select">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
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
        <Card data-testid="total-income-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Всего доходов</CardTitle>
            <TrendingUp className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono text-emerald-500">
                {formatCurrency(data?.total_income || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card data-testid="total-expense-card">
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

        <Card data-testid="net-cashflow-card">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Чистый поток</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className={`text-2xl font-bold font-mono ${(data?.net_cashflow || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {formatCurrency(data?.net_cashflow || 0)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card data-testid="cashflow-chart">
        <CardHeader>
          <CardTitle>Динамика по месяцам</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-80 w-full" />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--popover))', 
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px'
                    }}
                    formatter={(val) => formatCurrency(val)}
                  />
                  <Legend />
                  <Bar dataKey="Доходы" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Расходы" fill="#ef4444" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Table */}
      <Card data-testid="monthly-table">
        <CardHeader>
          <CardTitle>Детализация по месяцам</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="sticky left-0 bg-background">Статья</TableHead>
                    {MONTHS_RU.map((m, i) => (
                      <TableHead key={i} className="text-right min-w-24">{m}</TableHead>
                    ))}
                    <TableHead className="text-right min-w-28">Итого</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {/* Income row */}
                  <TableRow className="font-medium bg-emerald-500/5">
                    <TableCell className="sticky left-0 bg-emerald-500/5">Доходы</TableCell>
                    {data?.months?.map((m, i) => (
                      <TableCell key={i} className="text-right font-mono text-emerald-500">
                        {m.income > 0 ? formatCurrency(m.income) : '-'}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-mono text-emerald-500 font-bold">
                      {formatCurrency(data?.total_income || 0)}
                    </TableCell>
                  </TableRow>
                  
                  {/* Expense row */}
                  <TableRow className="font-medium bg-rose-500/5">
                    <TableCell className="sticky left-0 bg-rose-500/5">Расходы</TableCell>
                    {data?.months?.map((m, i) => (
                      <TableCell key={i} className="text-right font-mono text-rose-500">
                        {m.expense > 0 ? formatCurrency(m.expense) : '-'}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-mono text-rose-500 font-bold">
                      {formatCurrency(data?.total_expense || 0)}
                    </TableCell>
                  </TableRow>
                  
                  {/* Net row */}
                  <TableRow className="font-bold border-t-2">
                    <TableCell className="sticky left-0 bg-background">Чистый поток</TableCell>
                    {data?.months?.map((m, i) => (
                      <TableCell key={i} className={`text-right font-mono ${m.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {formatCurrency(m.net)}
                      </TableCell>
                    ))}
                    <TableCell className={`text-right font-mono ${(data?.net_cashflow || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {formatCurrency(data?.net_cashflow || 0)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CashFlowPage;
