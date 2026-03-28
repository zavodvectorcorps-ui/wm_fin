import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Card, CardContent } from '../components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import {
  Loader2, AlertTriangle, Banknote, Download, Settings2
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '../lib/utils';

const CashImportModal = ({ open, onOpenChange, onImported }) => {
  const { api } = useAuth();
  const [step, setStep] = useState('config'); // config | review
  const [loading, setLoading] = useState(false);

  // Config
  const [sheetUrl, setSheetUrl] = useState('');
  const [savedSheets, setSavedSheets] = useState([]);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Review data
  const [transactions, setTransactions] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [accounts, setAccounts] = useState([]);
  const [directions, setDirections] = useState([]);
  const [stats, setStats] = useState({ total: 0, duplicates: 0 });

  // Load saved sheets on open
  useEffect(() => {
    if (open) {
      loadSettings();
      // Default period: current month
      const now = new Date();
      const y = now.getFullYear();
      const m = String(now.getMonth() + 1).padStart(2, '0');
      setDateFrom(`${y}-${m}-01`);
      const lastDay = new Date(y, now.getMonth() + 1, 0).getDate();
      setDateTo(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    }
  }, [open]);

  const loadSettings = async () => {
    try {
      const res = await api().get('/cash-import/settings');
      setSavedSheets(res.data.sheets || []);
      if (res.data.sheets?.length > 0 && !sheetUrl) {
        setSheetUrl(res.data.sheets[0].url);
      }
    } catch {
      // ignore
    }
  };

  const fetchData = async () => {
    if (!sheetUrl) {
      toast.error('Укажите ссылку на Google Таблицу');
      return;
    }
    if (!dateFrom || !dateTo) {
      toast.error('Укажите период');
      return;
    }
    setLoading(true);
    try {
      const res = await api().post('/cash-import/fetch', {
        sheet_url: sheetUrl,
        date_from: dateFrom,
        date_to: dateTo,
      });
      const data = res.data;
      setTransactions(data.transactions || []);
      setAccounts(data.accounts || []);
      setDirections(data.directions || []);
      setStats({ total: data.total, duplicates: data.duplicates });

      // Auto-select non-duplicates
      const sel = new Set();
      data.transactions.forEach((t, i) => { if (!t.is_duplicate) sel.add(i); });
      setSelected(sel);

      // Save sheet URL to settings if new
      if (!savedSheets.find(s => s.url === sheetUrl)) {
        const newSheets = [...savedSheets, { url: sheetUrl, name: `Таблица ${savedSheets.length + 1}` }];
        await api().put('/cash-import/settings', { sheets: newSheets });
        setSavedSheets(newSheets);
      }

      setStep('review');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка загрузки таблицы');
    } finally {
      setLoading(false);
    }
  };

  const toggleOne = (idx) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === transactions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(transactions.map((_, i) => i)));
    }
  };

  const updateTxField = (idx, field, value) => {
    const updated = [...transactions];
    updated[idx] = { ...updated[idx], [field]: value };
    setTransactions(updated);
  };

  const confirmImport = async () => {
    const txsToImport = transactions.filter((_, i) => selected.has(i));
    if (txsToImport.length === 0) {
      toast.error('Выберите хотя бы одну операцию');
      return;
    }
    setLoading(true);
    try {
      const res = await api().post('/cash-import/confirm', {
        transactions: txsToImport.map(t => ({
          date: t.date,
          type: t.type,
          amount: t.amount,
          currency: t.currency,
          contractor: t.contractor,
          description: t.description,
          account_id: t.account_id,
          account_name: t.account_name,
          direction_id: t.direction_id,
          direction_name: t.direction_name,
          category_id: t.category_id || '',
          comment: t.comment || '',
          needs_review: t.needs_review || false,
        })),
      });
      toast.success(`Импортировано ${res.data.imported_count} операций`);
      onImported?.();
      handleClose();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Ошибка импорта');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setStep('config');
    setTransactions([]);
    setSelected(new Set());
    onOpenChange(false);
  };

  const selectedTotal = transactions
    .filter((_, i) => selected.has(i))
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto" data-testid="cash-import-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Импорт наличных из Google Таблицы
          </DialogTitle>
        </DialogHeader>

        {step === 'config' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Ссылка на Google Таблицу</Label>
              {savedSheets.length > 0 && (
                <Select
                  value={sheetUrl}
                  onValueChange={setSheetUrl}
                >
                  <SelectTrigger className="text-foreground border-border bg-card" data-testid="saved-sheets-select">
                    <SelectValue placeholder="Выберите сохранённую таблицу" />
                  </SelectTrigger>
                  <SelectContent>
                    {savedSheets.map((s, i) => (
                      <SelectItem key={i} value={s.url}>{s.name || s.url}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Input
                value={sheetUrl}
                onChange={e => setSheetUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/..."
                data-testid="sheet-url-input"
              />
              <p className="text-xs text-muted-foreground">
                Таблица должна быть доступна по ссылке (публичный доступ для просмотра)
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Период с</Label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={e => setDateFrom(e.target.value)}
                  data-testid="cash-date-from"
                />
              </div>
              <div className="space-y-2">
                <Label>Период по</Label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={e => setDateTo(e.target.value)}
                  data-testid="cash-date-to"
                />
              </div>
            </div>

            <Button
              onClick={fetchData}
              disabled={loading || !sheetUrl}
              className="w-full"
              data-testid="fetch-cash-btn"
            >
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
              Загрузить данные
            </Button>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4">
            {/* Stats */}
            <div className="flex gap-3 flex-wrap">
              <Badge variant="outline" className="text-base px-3 py-1">
                Всего: {stats.total}
              </Badge>
              <Badge variant="outline" className="text-base px-3 py-1 text-emerald-500 border-emerald-500/30">
                Выбрано: {selected.size}
              </Badge>
              {stats.duplicates > 0 && (
                <Badge variant="outline" className="text-base px-3 py-1 text-amber-500 border-amber-500/30">
                  <AlertTriangle className="h-3 w-3 mr-1" /> Дубликаты: {stats.duplicates}
                </Badge>
              )}
              <Badge variant="outline" className="text-base px-3 py-1 font-mono">
                Сумма: {formatCurrency(selectedTotal, 'PLN')}
              </Badge>
            </div>

            {/* Table */}
            <div className="border rounded-lg max-h-[55vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selected.size === transactions.length}
                        onCheckedChange={toggleAll}
                        data-testid="cash-select-all"
                      />
                    </TableHead>
                    <TableHead className="w-24">Дата</TableHead>
                    <TableHead className="w-20">Тип</TableHead>
                    <TableHead className="min-w-[180px]">Описание</TableHead>
                    <TableHead className="w-32">Направление</TableHead>
                    <TableHead className="w-28 text-right">Сумма</TableHead>
                    <TableHead className="w-36">Комментарий</TableHead>
                    <TableHead className="w-10">?</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((t, idx) => (
                    <TableRow
                      key={idx}
                      className={t.is_duplicate ? 'opacity-40' : ''}
                      data-testid={`cash-tx-${idx}`}
                    >
                      <TableCell>
                        <Checkbox
                          checked={selected.has(idx)}
                          onCheckedChange={() => toggleOne(idx)}
                        />
                      </TableCell>
                      <TableCell className="text-xs font-mono">{t.date}</TableCell>
                      <TableCell>
                        {t.type === 'income'
                          ? <Badge className="bg-emerald-600/20 text-emerald-500 text-xs">Приход</Badge>
                          : <Badge className="bg-rose-600/20 text-rose-500 text-xs">Расход</Badge>
                        }
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium truncate max-w-[250px]">{t.description || t.message}</p>
                          <p className="text-xs text-muted-foreground">{t.contractor}</p>
                          {t.is_duplicate && (
                            <Badge variant="outline" className="text-xs text-amber-500 border-amber-500/30 mt-0.5">
                              <AlertTriangle className="h-3 w-3 mr-1" /> Возможный дубликат
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={t.direction_id || '__none__'}
                          onValueChange={v => updateTxField(idx, 'direction_id', v === '__none__' ? '' : v)}
                        >
                          <SelectTrigger className="h-7 text-xs text-foreground border-border bg-card" data-testid={`cash-direction-${idx}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">— нет</SelectItem>
                            {directions.map(d => (
                              <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm text-rose-500">
                        -{formatCurrency(t.amount, t.currency)}
                      </TableCell>
                      <TableCell>
                        <Input
                          className="h-7 text-xs"
                          value={t.comment || ''}
                          onChange={e => updateTxField(idx, 'comment', e.target.value)}
                          placeholder="Комментарий"
                          data-testid={`cash-comment-${idx}`}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="icon"
                          variant={t.needs_review ? 'default' : 'ghost'}
                          className={`h-6 w-6 ${t.needs_review ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'opacity-40 hover:opacity-100'}`}
                          onClick={() => updateTxField(idx, 'needs_review', !t.needs_review)}
                          title="Под вопросом"
                        >
                          <AlertTriangle className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('config')} data-testid="cash-back-btn">
                Назад
              </Button>
              <Button
                onClick={confirmImport}
                disabled={loading || selected.size === 0}
                data-testid="cash-confirm-btn"
              >
                {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Импортировать {selected.size} операций
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default CashImportModal;
