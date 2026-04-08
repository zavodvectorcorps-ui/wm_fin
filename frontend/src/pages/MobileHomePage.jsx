import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../components/ui/sheet';
import { ArrowDownLeft, ArrowUpRight, ArrowLeftRight, Wallet, TrendingUp, TrendingDown } from 'lucide-react';
import { formatCurrency, todayLocal, getPeriodDates, formatDate } from '../lib/utils';
import { toast } from 'sonner';

const MobileHomePage = () => {
  const { api } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [totalBalance, setTotalBalance] = useState(0);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [directions, setDirections] = useState([]);
  const [categories, setCategories] = useState([]);
  const [eurPlnRate, setEurPlnRate] = useState(0);

  // Form state
  const [sheetOpen, setSheetOpen] = useState(false);
  const [formType, setFormType] = useState('income');
  const [formData, setFormData] = useState({
    date: todayLocal(),
    amount: '',
    currency: 'PLN',
    account_id: '',
    to_account_id: '',
    direction_id: '',
    category_id: '',
    description: '',
  });

  // Desktop redirect to full dashboard
  useEffect(() => {
    if (window.innerWidth >= 1024) {
      navigate('/dashboard', { replace: true });
    }
  }, [navigate]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const dates = getPeriodDates('current_month');
      const [summaryRes, transRes, accountsRes, directionsRes, categoriesRes, rateRes] = await Promise.all([
        api().get('/analytics/summary', { params: { date_from: dates.from, date_to: dates.to } }),
        api().get('/transactions', { params: { date_from: '2020-01-01', date_to: '2030-12-31', per_page: 5 } }),
        api().get('/accounts'),
        api().get('/directions'),
        api().get('/categories'),
        api().get('/exchange-rate').catch(() => ({ data: { eur_pln: 0 } })),
      ]);

      const data = summaryRes.data;
      const rate = rateRes.data.eur_pln || 0;
      setEurPlnRate(rate);

      // Calculate total balance in PLN
      let bal = 0;
      let inc = 0;
      let exp = 0;
      (data.accounts || []).forEach(a => {
        const multiplier = a.currency === 'EUR' ? rate : 1;
        bal += (a.current_balance || 0) * multiplier;
        inc += (a.period_income || 0) * multiplier;
        exp += (a.period_expense || 0) * multiplier;
      });
      setTotalBalance(bal);
      setIncome(inc);
      setExpense(exp);

      setRecentTransactions(transRes.data.items || []);
      setAccounts(accountsRes.data);
      setDirections(directionsRes.data);
      setCategories(categoriesRes.data);
    } catch (err) {
      console.error('Mobile home fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openForm = (type) => {
    setFormType(type);
    setFormData({
      date: todayLocal(),
      amount: '',
      currency: 'PLN',
      account_id: accounts[0]?.id || '',
      to_account_id: '',
      direction_id: directions[0]?.id || '',
      category_id: '',
      description: '',
    });
    setSheetOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.amount || !formData.account_id || !formData.direction_id) {
      toast.error('Заполните сумму, счёт и направление');
      return;
    }

    try {
      await api().post('/transactions', {
        ...formData,
        type: formType,
        amount: parseFloat(formData.amount),
        category_id: formData.category_id || null,
        to_account_id: formData.to_account_id || null,
        status: 'fact',
      });
      toast.success('Операция добавлена');
      setSheetOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка сохранения');
    }
  };

  const filteredCategories = categories.filter(c =>
    formType === 'transfer' ? true : c.type === formType
  );

  const typeConfig = {
    income: { label: 'Приход', color: 'text-emerald-500', sign: '+' },
    expense: { label: 'Расход', color: 'text-rose-500', sign: '-' },
    transfer: { label: 'Перевод', color: 'text-sky-500', sign: '' },
  };

  return (
    <div className="p-4 space-y-5" data-testid="mobile-home">
      {/* Balance Card */}
      <Card className="border-0 bg-gradient-to-br from-primary/15 to-primary/5">
        <CardContent className="pt-5 pb-4 px-5">
          <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Деньги бизнеса</p>
          <p className={`text-3xl font-bold font-mono tracking-tight ${totalBalance >= 0 ? 'text-foreground' : 'text-rose-500'}`} data-testid="mobile-total-balance">
            {totalBalance >= 0 ? '' : ''}{formatCurrency(totalBalance, 'PLN')}
          </p>
          <div className="flex gap-4 mt-3">
            <div className="flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-500" />
              <span className="text-xs text-emerald-500 font-mono">{formatCurrency(income, 'PLN')}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingDown className="h-3.5 w-3.5 text-rose-500" />
              <span className="text-xs text-rose-500 font-mono">{formatCurrency(expense, 'PLN')}</span>
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">Текущий месяц</p>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <Button
          onClick={() => openForm('income')}
          className="h-24 bg-emerald-600 hover:bg-emerald-700 flex-col gap-2 text-base font-semibold rounded-2xl shadow-lg shadow-emerald-900/20"
          data-testid="mobile-income-btn"
        >
          <ArrowDownLeft className="h-7 w-7" />
          Доход
        </Button>
        <Button
          onClick={() => openForm('expense')}
          className="h-24 bg-rose-600 hover:bg-rose-700 flex-col gap-2 text-base font-semibold rounded-2xl shadow-lg shadow-rose-900/20"
          data-testid="mobile-expense-btn"
        >
          <ArrowUpRight className="h-7 w-7" />
          Расход
        </Button>
      </div>
      <Button
        onClick={() => openForm('transfer')}
        variant="outline"
        className="w-full h-12 gap-2 text-sm font-medium rounded-xl border-border text-foreground"
        data-testid="mobile-transfer-btn"
      >
        <ArrowLeftRight className="h-5 w-5" />
        Перевод между счетами
      </Button>

      {/* Recent Transactions */}
      {recentTransactions.length > 0 && (
        <div>
          <p className="text-sm font-medium text-muted-foreground mb-2">Последние операции</p>
          <Card>
            <CardContent className="p-0 divide-y divide-border">
              {recentTransactions.map(t => {
                const cfg = typeConfig[t.type] || typeConfig.expense;
                return (
                  <div key={t.id} className="flex items-center justify-between px-4 py-3" data-testid={`recent-tx-${t.id}`}>
                    <div className="min-w-0 flex-1 mr-3">
                      <p className="text-sm font-medium truncate">
                        {t.description || t.category_name || t.contractor_name || cfg.label}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(t.date)} &middot; {t.account_name}
                        {t.type === 'transfer' && t.to_account_name ? ` → ${t.to_account_name}` : ''}
                      </p>
                    </div>
                    <span className={`text-sm font-mono font-semibold shrink-0 ${cfg.color}`}>
                      {cfg.sign}{formatCurrency(t.amount, t.currency)}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Transaction Form Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
          <SheetHeader>
            <SheetTitle className={typeConfig[formType]?.color}>
              {formType === 'income' ? 'Новый доход' : formType === 'expense' ? 'Новый расход' : 'Новый перевод'}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-4 mt-4 overflow-y-auto max-h-[calc(85vh-120px)] pb-4">
            {/* Amount - large and prominent */}
            <div>
              <Label className="text-xs text-muted-foreground">Сумма</Label>
              <Input
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={formData.amount}
                onChange={e => setFormData(prev => ({ ...prev, amount: e.target.value }))}
                className="text-2xl h-14 font-mono font-bold text-center"
                autoFocus
                data-testid="mobile-form-amount"
              />
            </div>

            {/* Currency */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Валюта</Label>
                <Select value={formData.currency} onValueChange={v => setFormData(prev => ({ ...prev, currency: v }))}>
                  <SelectTrigger className="bg-card text-foreground" data-testid="mobile-form-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Дата</Label>
                <Input
                  type="date"
                  value={formData.date}
                  onChange={e => setFormData(prev => ({ ...prev, date: e.target.value }))}
                  className="bg-card text-foreground"
                  data-testid="mobile-form-date"
                />
              </div>
            </div>

            {/* Account */}
            <div>
              <Label className="text-xs text-muted-foreground">
                {formType === 'transfer' ? 'С какого счёта' : 'Счёт'}
              </Label>
              <Select value={formData.account_id} onValueChange={v => setFormData(prev => ({ ...prev, account_id: v }))}>
                <SelectTrigger className="bg-card text-foreground" data-testid="mobile-form-account">
                  <SelectValue placeholder="Выберите счёт" />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* To Account (for transfers) */}
            {formType === 'transfer' && (
              <div>
                <Label className="text-xs text-muted-foreground">На какой счёт</Label>
                <Select value={formData.to_account_id} onValueChange={v => setFormData(prev => ({ ...prev, to_account_id: v }))}>
                  <SelectTrigger className="bg-card text-foreground" data-testid="mobile-form-to-account">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(a => a.id !== formData.account_id).map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name} ({a.currency})</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Direction */}
            <div>
              <Label className="text-xs text-muted-foreground">Направление</Label>
              <Select value={formData.direction_id} onValueChange={v => setFormData(prev => ({ ...prev, direction_id: v }))}>
                <SelectTrigger className="bg-card text-foreground" data-testid="mobile-form-direction">
                  <SelectValue placeholder="Выберите направление" />
                </SelectTrigger>
                <SelectContent>
                  {directions.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Category */}
            {filteredCategories.length > 0 && (
              <div>
                <Label className="text-xs text-muted-foreground">Категория</Label>
                <Select value={formData.category_id} onValueChange={v => setFormData(prev => ({ ...prev, category_id: v }))}>
                  <SelectTrigger className="bg-card text-foreground" data-testid="mobile-form-category">
                    <SelectValue placeholder="Без категории" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Без категории</SelectItem>
                    {filteredCategories.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Description */}
            <div>
              <Label className="text-xs text-muted-foreground">Описание</Label>
              <Input
                placeholder="Необязательно"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                className="bg-card text-foreground"
                data-testid="mobile-form-description"
              />
            </div>

            {/* Submit */}
            <Button
              onClick={handleSubmit}
              className={`w-full h-12 text-base font-semibold rounded-xl ${
                formType === 'income' ? 'bg-emerald-600 hover:bg-emerald-700' :
                formType === 'expense' ? 'bg-rose-600 hover:bg-rose-700' :
                'bg-sky-600 hover:bg-sky-700'
              }`}
              data-testid="mobile-form-submit"
            >
              Сохранить
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default MobileHomePage;
