import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { 
  Wallet, Building2, CreditCard, PiggyBank, TrendingUp, TrendingDown,
  ArrowUpRight, ArrowDownRight, Calculator
} from 'lucide-react';
import { formatCurrency, formatDate } from '../lib/utils';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const COLORS = ['#3b82f6', '#22c55e', '#f97316', '#8b5cf6', '#ec4899', '#14b8a6'];

const ACCOUNT_TYPE_LABELS = {
  cash: 'Наличные',
  checking: 'Расчётный счёт',
  card: 'Карта',
  savings: 'Сбережения'
};

const ACCOUNT_TYPE_ICONS = {
  cash: Wallet,
  checking: Building2,
  card: CreditCard,
  savings: PiggyBank
};

export const BalancePage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api().get('/analytics/balance');
      setData(res.data);
    } catch (error) {
      console.error('Failed to fetch balance data:', error);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pieData = data?.assets?.by_currency 
    ? Object.entries(data.assets.by_currency).map(([currency, amount], i) => ({
        name: currency,
        value: Math.abs(amount),
        fill: COLORS[i % COLORS.length]
      }))
    : [];

  const AccountGroup = ({ type, accounts }) => {
    const Icon = ACCOUNT_TYPE_ICONS[type] || Wallet;
    const total = accounts.reduce((sum, a) => sum + a.balance, 0);
    
    if (accounts.length === 0) return null;
    
    return (
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">{ACCOUNT_TYPE_LABELS[type]}</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {accounts.map((account, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                <div>
                  <p className="font-medium">{account.name}</p>
                  {account.bank && <p className="text-xs text-muted-foreground">{account.bank}</p>}
                </div>
                <span className={`font-mono font-semibold ${account.balance >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {formatCurrency(account.balance, account.currency)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 border-t border-border">
              <span className="text-muted-foreground">Итого</span>
              <span className="font-mono font-bold">{formatCurrency(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Баланс</h1>
        <p className="text-muted-foreground">Активы и обязательства на {data?.date ? formatDate(data.date) : 'сегодня'}</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="card-hover" data-testid="total-assets">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Активы</CardTitle>
            <Wallet className="h-5 w-5 text-emerald-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono text-emerald-500">
                {formatCurrency(data?.assets?.total || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="total-liabilities">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Обязательства</CardTitle>
            <TrendingDown className="h-5 w-5 text-rose-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono text-rose-500">
                {formatCurrency(data?.liabilities?.total || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="total-receivables">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Дебиторка</CardTitle>
            <TrendingUp className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className="text-2xl font-bold font-mono text-blue-500">
                {formatCurrency(data?.receivables?.total || 0)}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-hover" data-testid="net-worth">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Чистый капитал</CardTitle>
            <Calculator className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-32" />
            ) : (
              <div className={`text-2xl font-bold font-mono ${(data?.net_worth || 0) >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                {formatCurrency(data?.net_worth || 0)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Assets by Type */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold">Активы по типам</h2>
          
          {loading ? (
            <div className="space-y-4">
              {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <AccountGroup type="cash" accounts={data?.assets?.cash || []} />
              <AccountGroup type="checking" accounts={data?.assets?.checking || []} />
              <AccountGroup type="card" accounts={data?.assets?.card || []} />
              <AccountGroup type="savings" accounts={data?.assets?.savings || []} />
            </div>
          )}
        </div>

        {/* Currency Distribution */}
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">По валютам</h2>
          
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <Skeleton className="h-48 w-full" />
              ) : pieData.length > 0 ? (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
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
              
              {data?.assets?.by_currency && (
                <div className="space-y-2 mt-4">
                  {Object.entries(data.assets.by_currency).map(([currency, amount], i) => (
                    <div key={currency} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                        <span>{currency}</span>
                      </div>
                      <span className="font-mono font-semibold">{formatCurrency(amount, currency)}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Liabilities & Receivables */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Pending Payments (Liabilities) */}
        <Card data-testid="liabilities-table">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownRight className="h-5 w-5 text-rose-500" />
              Ожидаемые расходы
            </CardTitle>
            <CardDescription>Запланированные платежи</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : data?.liabilities?.pending_payments?.length > 0 ? (
              <div className="space-y-2">
                {data.liabilities.pending_payments.slice(0, 10).map((payment, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{payment.category_name || 'Без категории'}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(payment.date)}</p>
                    </div>
                    <span className="font-mono text-rose-500">-{formatCurrency(payment.amount, payment.currency)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">Нет запланированных расходов</p>
            )}
          </CardContent>
        </Card>

        {/* Pending Income (Receivables) */}
        <Card data-testid="receivables-table">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowUpRight className="h-5 w-5 text-emerald-500" />
              Ожидаемые поступления
            </CardTitle>
            <CardDescription>Запланированные доходы</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : data?.receivables?.pending_income?.length > 0 ? (
              <div className="space-y-2">
                {data.receivables.pending_income.slice(0, 10).map((payment, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{payment.category_name || 'Без категории'}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(payment.date)}</p>
                    </div>
                    <span className="font-mono text-emerald-500">+{formatCurrency(payment.amount, payment.currency)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-4">Нет ожидаемых поступлений</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BalancePage;
