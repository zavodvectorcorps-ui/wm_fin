import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Alert, AlertDescription } from '../components/ui/alert';
import { 
  Download, Trash2, RefreshCw, Loader2, Plug, Archive, 
  TrendingUp, TrendingDown, ArrowLeftRight, Search, FileSpreadsheet
} from 'lucide-react';
import { toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

const fmtMoney = (val, currency = 'PLN') => {
  const num = Number(val) || 0;
  const sym = { PLN: 'zł', EUR: '€', USD: '$' }[currency] || currency;
  return `${num.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${sym}`;
};

export const AdeskMigrationPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(false);
  const [migrating, setMigrating] = useState(false);

  // Connection
  const [apiToken, setApiToken] = useState('');
  const [connected, setConnected] = useState(false);
  const [totalInAdesk, setTotalInAdesk] = useState(0);

  // Migration params
  const [dateFrom, setDateFrom] = useState('2023-01-01');
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);

  // Archive data
  const [drafts, setDrafts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [totalDrafts, setTotalDrafts] = useState(0);
  const [page, setPage] = useState(1);

  // Filters
  const [filterCurrency, setFilterCurrency] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterAccount, setFilterAccount] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Migration result
  const [migrationResult, setMigrationResult] = useState(null);

  const fetchDrafts = useCallback(async () => {
    try {
      const params = { page, limit: 50 };
      if (filterCurrency !== 'all') params.currency = filterCurrency;
      if (filterType !== 'all') params.type = filterType;
      if (filterAccount !== 'all') params.account_name = filterAccount;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const res = await api().get('/adesk/drafts', { params });
      setDrafts(res.data.drafts || []);
      setTotalDrafts(res.data.total || 0);
      setSummary(res.data.summary || null);
    } catch (error) {
      console.error('Error fetching drafts:', error);
    }
  }, [api, page, filterCurrency, filterType, filterAccount, searchQuery]);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts]);

  const testConnection = async () => {
    if (!apiToken.trim()) { toast.error('Введите API токен'); return; }
    setLoading(true);
    try {
      const res = await api().post('/adesk/test-connection', { api_token: apiToken });
      if (res.data.status === 'success') {
        setConnected(true);
        setTotalInAdesk(res.data.transactions_count);
        toast.success(res.data.message);
      } else {
        toast.error(res.data.message);
      }
    } catch { toast.error('Ошибка подключения'); }
    finally { setLoading(false); }
  };

  const startMigration = async () => {
    if (!apiToken.trim()) { toast.error('Введите API токен'); return; }
    setMigrating(true);
    setMigrationResult(null);
    try {
      const res = await api().post('/adesk/start-migration', {
        api_token: apiToken,
        date_from: dateFrom,
        date_to: dateTo,
        migrate_transactions: true, migrate_contractors: true,
        migrate_projects: true, migrate_accounts: true
      });
      if (res.data.status === 'success') {
        setMigrationResult(res.data);
        toast.success(res.data.message);
        fetchDrafts();
      }
    } catch (e) { toast.error('Ошибка миграции: ' + (e.response?.data?.detail || e.message)); }
    finally { setMigrating(false); }
  };

  const exportCSV = async () => {
    try {
      const params = {};
      if (filterCurrency !== 'all') params.currency = filterCurrency;
      if (filterType !== 'all') params.type = filterType;
      const res = await api().get('/adesk/export', { params, responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'adesk_archive.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('CSV экспортирован');
    } catch { toast.error('Ошибка экспорта'); }
  };

  const deleteAll = async () => {
    if (!confirm('Удалить ВСЕ данные архива Adesk? Это действие необратимо.')) return;
    setLoading(true);
    try {
      const res = await api().delete('/adesk/drafts/all');
      toast.success(`Удалено: ${res.data.count} записей`);
      fetchDrafts();
      setMigrationResult(null);
    } catch { toast.error('Ошибка удаления'); }
    finally { setLoading(false); }
  };

  const typeIcon = (type) => {
    if (type === 'income') return <TrendingUp className="h-4 w-4 text-emerald-500" />;
    if (type === 'expense') return <TrendingDown className="h-4 w-4 text-rose-500" />;
    return <ArrowLeftRight className="h-4 w-4 text-blue-500" />;
  };

  const typeBadge = (type, isTransfer) => {
    if (isTransfer) return <Badge variant="outline" className="text-blue-500 border-blue-500/30">Перевод</Badge>;
    if (type === 'income') return <Badge variant="outline" className="text-emerald-500 border-emerald-500/30">Доход</Badge>;
    return <Badge variant="outline" className="text-rose-500 border-rose-500/30">Расход</Badge>;
  };

  const totalPages = Math.ceil(totalDrafts / 50);

  return (
    <div className="p-6 md:p-8 space-y-6" data-testid="adesk-migration-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Архив Adesk</h1>
        <p className="text-muted-foreground">Импорт и просмотр операций из Adesk для справки</p>
      </div>

      {/* Connection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plug className="h-5 w-5" />Подключение</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Label>API-токен Adesk</Label>
              <Input 
                type="password" value={apiToken} onChange={e => setApiToken(e.target.value)}
                placeholder="Введите токен из настроек Adesk" data-testid="adesk-api-token"
              />
            </div>
            <Button onClick={testConnection} disabled={loading} data-testid="adesk-test-btn">
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plug className="h-4 w-4 mr-2" />}
              Проверить
            </Button>
          </div>
          
          {connected && (
            <Alert className="border-emerald-500/30 bg-emerald-500/5">
              <AlertDescription className="text-emerald-600">
                Подключено. Всего операций в Adesk: <strong>{totalInAdesk.toLocaleString()}</strong>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Import */}
      {connected && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Archive className="h-5 w-5" />Загрузить в архив</CardTitle>
            <CardDescription>Операции загружаются в раздел архива для справки. В основную программу не попадают.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4 items-end">
              <div>
                <Label>С даты</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} data-testid="adesk-date-from" />
              </div>
              <div>
                <Label>По дату</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} data-testid="adesk-date-to" />
              </div>
              <Button onClick={startMigration} disabled={migrating} data-testid="adesk-start-btn">
                {migrating ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Загрузка...</> : <><RefreshCw className="h-4 w-4 mr-2" />Загрузить</>}
              </Button>
            </div>

            {migrationResult && (
              <Alert className="border-blue-500/30 bg-blue-500/5">
                <AlertDescription>
                  <div className="font-medium mb-2">Результат загрузки:</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                    <div>Загружено: <strong>{migrationResult.imported}</strong></div>
                    <div>Ошибок: <strong>{migrationResult.errors}</strong></div>
                    {migrationResult.by_currency && Object.entries(migrationResult.by_currency).map(([cur, cnt]) => (
                      <div key={cur}>{cur}: <strong>{cnt}</strong> оп.</div>
                    ))}
                  </div>
                  {migrationResult.by_account && (
                    <div className="mt-2 text-sm">
                      <div className="font-medium">По счетам:</div>
                      {Object.entries(migrationResult.by_account).map(([acc, info]) => (
                        <div key={acc} className="ml-2">
                          {acc}: {info.count} оп. (доходы: {fmtMoney(info.income)}, расходы: {fmtMoney(info.expense)})
                        </div>
                      ))}
                    </div>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      {summary && summary.total_records > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {Object.entries(summary.income || {}).filter(([_, v]) => v > 0).map(([cur, val]) => (
            <Card key={`inc-${cur}`}>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Доходы ({cur})</div>
                <div className="text-2xl font-bold text-emerald-500">+{fmtMoney(val, cur)}</div>
              </CardContent>
            </Card>
          ))}
          {Object.entries(summary.expense || {}).filter(([_, v]) => v > 0).map(([cur, val]) => (
            <Card key={`exp-${cur}`}>
              <CardContent className="pt-6">
                <div className="text-sm text-muted-foreground">Расходы ({cur})</div>
                <div className="text-2xl font-bold text-rose-500">-{fmtMoney(val, cur)}</div>
              </CardContent>
            </Card>
          ))}
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm text-muted-foreground">Всего записей</div>
              <div className="text-2xl font-bold">{summary.total_records.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Archive Table */}
      {(totalDrafts > 0 || summary?.total_records > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" />
                Архив операций ({totalDrafts.toLocaleString()})
              </CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportCSV} data-testid="adesk-export-btn">
                  <Download className="h-4 w-4 mr-2" />CSV
                </Button>
                <Button variant="destructive" size="sm" onClick={deleteAll} data-testid="adesk-delete-all-btn">
                  <Trash2 className="h-4 w-4 mr-2" />Очистить
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-3">
              <div className="w-40">
                <Select value={filterCurrency} onValueChange={v => { setFilterCurrency(v); setPage(1); }}>
                  <SelectTrigger data-testid="filter-currency"><SelectValue placeholder="Валюта" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все валюты</SelectItem>
                    <SelectItem value="PLN">PLN</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="w-40">
                <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1); }}>
                  <SelectTrigger data-testid="filter-type"><SelectValue placeholder="Тип" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Все типы</SelectItem>
                    <SelectItem value="income">Доходы</SelectItem>
                    <SelectItem value="expense">Расходы</SelectItem>
                    <SelectItem value="transfer">Переводы</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {summary?.accounts?.length > 0 && (
                <div className="w-48">
                  <Select value={filterAccount} onValueChange={v => { setFilterAccount(v); setPage(1); }}>
                    <SelectTrigger data-testid="filter-account"><SelectValue placeholder="Счёт" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все счета</SelectItem>
                      {summary.accounts.map(acc => (
                        <SelectItem key={acc} value={acc}>{acc}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="flex-1 min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Поиск по описанию, контрагенту..." 
                    className="pl-9"
                    value={searchQuery} onChange={e => { setSearchQuery(e.target.value); setPage(1); }}
                    data-testid="adesk-search"
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">Дата</TableHead>
                    <TableHead className="w-24">Тип</TableHead>
                    <TableHead className="text-right w-32">Сумма</TableHead>
                    <TableHead>Счёт</TableHead>
                    <TableHead>Проект</TableHead>
                    <TableHead>Категория</TableHead>
                    <TableHead>Контрагент</TableHead>
                    <TableHead>Описание</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {drafts.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                        {totalDrafts === 0 ? 'Архив пуст. Загрузите данные из Adesk.' : 'Нет операций по фильтру'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    drafts.map(d => (
                      <TableRow key={d.id} data-testid={`adesk-row-${d.adesk_id}`}>
                        <TableCell className="text-sm whitespace-nowrap">{d.date}</TableCell>
                        <TableCell>{typeBadge(d.type, d.is_transfer)}</TableCell>
                        <TableCell className={`text-right font-medium whitespace-nowrap ${d.type === 'income' ? 'text-emerald-500' : d.type === 'expense' ? 'text-rose-500' : 'text-blue-500'}`}>
                          {d.type === 'income' ? '+' : d.type === 'expense' ? '-' : ''}{fmtMoney(d.amount, d.currency)}
                        </TableCell>
                        <TableCell className="text-sm">{d.account_name || '-'}</TableCell>
                        <TableCell className="text-sm">{d.project_name || '-'}</TableCell>
                        <TableCell className="text-sm">{d.category_name || '-'}</TableCell>
                        <TableCell className="text-sm">{d.contractor_name || '-'}</TableCell>
                        <TableCell className="text-sm max-w-[200px] truncate" title={d.description}>{d.description || '-'}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  Стр. {page} из {totalPages} ({totalDrafts} записей)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                    Назад
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
                    Вперёд
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default AdeskMigrationPage;
