import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Skeleton } from '../components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from '../components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '../components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Textarea } from '../components/ui/textarea';
import DescriptionAutocomplete from '../components/DescriptionAutocomplete';
import { Checkbox } from '../components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '../components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../components/ui/tooltip';
import { Calendar as CalendarUI } from '../components/ui/calendar';
import { ReceiptUploadDialog } from '../components/ReceiptUploadDialog';
import { AnalyzePendingDialog } from '../components/AnalyzePendingDialog';
import { AttachmentThumb } from '../components/AttachmentThumb';
import { 
  Plus, Minus, ArrowLeftRight, Search, Filter, Pencil, ArrowDownToLine, Bot, 
  Trash2, Calendar, MoreHorizontal, Paperclip, FileText, Link2, Unlink, AlertTriangle,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, CalendarIcon, X, Loader2,
  Wallet, Info, HelpCircle, Receipt
} from 'lucide-react';
import { formatCurrency, formatDate, formatTime, formatDateTime, getDirectionClass, getStatusLabel, getPeriodDates, getTypeLabel, todayLocal, cn } from '../lib/utils';
import { toast } from 'sonner';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/ui/dropdown-menu';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

const sourceIcons = {
  manual: Pencil,
  import: ArrowDownToLine,
  telegram_bot: Bot
};

const CashOnHand = ({ data, eurPlnRate }) => {
  if (!data || !data.by_currency) return null;
  const entries = Object.entries(data.by_currency).filter(([, v]) => Math.abs(v) > 0.005);
  if (entries.length === 0) return null;

  const sumPln = (byCur) => {
    let total = 0;
    for (const [cur, v] of Object.entries(byCur || {})) {
      if (cur === 'EUR' && eurPlnRate > 0) total += v * eurPlnRate;
      else total += v;
    }
    return total;
  };
  const totalPln = sumPln(data.by_currency);

  const startBy = data.period_start_by_currency;
  const endBy = data.period_end_by_currency;
  const hasPeriod = !!(startBy && endBy);
  const startPln = hasPeriod ? sumPln(startBy) : null;
  const endPln = hasPeriod ? sumPln(endBy) : null;
  const deltaPln = (hasPeriod && startPln !== null && endPln !== null) ? endPln - startPln : null;

  // Per-currency entries to render (current row)
  return (
    <Card className="border-sky-500/30 bg-sky-500/5" data-testid="cash-on-hand">
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-sky-300 flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Денег на счетах
            <span className="text-xs text-muted-foreground font-normal">
              (включая заёмные средства)
            </span>
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-sky-300 transition-colors"
                    data-testid="cash-on-hand-help"
                    aria-label="Что это"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed bg-slate-900 text-slate-100 border border-sky-500/30">
                  <p className="font-semibold mb-1">Это реальная касса прямо сейчас</p>
                  <p className="mb-1.5">Сумма <span className="font-mono">current_balance</span> по всем активным НЕ-займовым счетам, включая начальные остатки при создании счёта.</p>
                  <p className="text-muted-foreground">Не путать с «Балансом PLN/EUR» сверху — там <b>движение за период</b> (Доходы − Расходы по операциям), а тут <b>остаток сейчас</b>.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </p>
          <p className="text-xs text-muted-foreground">
            {(data.accounts || []).map(a => a.name).join(' • ')}
          </p>
        </div>

        {/* "Now" row — current totals */}
        <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-3">
          {entries.map(([cur, v]) => (
            <Card key={cur}>
              <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
                <p className="text-xs text-muted-foreground">Сейчас {cur}</p>
                <p className={`text-sm sm:text-lg font-bold font-mono truncate ${v >= 0 ? 'text-sky-200' : 'text-rose-400'}`}>
                  {formatCurrency(v, cur)}
                </p>
              </CardContent>
            </Card>
          ))}
          <Card className="border-sky-400/40">
            <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
              <p className="text-xs text-muted-foreground">Сейчас итого в PLN {eurPlnRate ? `(EUR × ${eurPlnRate.toFixed(4)})` : ''}</p>
              <p className={`text-sm sm:text-lg font-bold font-mono truncate ${totalPln >= 0 ? 'text-sky-100' : 'text-rose-400'}`}>
                {formatCurrency(totalPln, 'PLN')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Period start / end / delta — only when a date filter is applied */}
        {hasPeriod && (
          <div className="pt-2 border-t border-sky-500/20">
            <p className="text-xs text-muted-foreground mb-2">Движение средств за выбранный период (PLN-эквивалент)</p>
            <div className="grid gap-2 sm:gap-3 grid-cols-3">
              <Card>
                <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
                  <p className="text-xs text-muted-foreground">На начало периода</p>
                  <p className="text-sm sm:text-lg font-bold font-mono truncate text-muted-foreground">
                    {formatCurrency(startPln, 'PLN')}
                  </p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
                  <p className="text-xs text-muted-foreground">На конец периода</p>
                  <p className="text-sm sm:text-lg font-bold font-mono truncate text-sky-200">
                    {formatCurrency(endPln, 'PLN')}
                  </p>
                </CardContent>
              </Card>
              <Card className={deltaPln >= 0 ? 'border-emerald-500/30' : 'border-rose-500/30'}>
                <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
                  <p className="text-xs text-muted-foreground">Изменение</p>
                  <p className={`text-sm sm:text-lg font-bold font-mono truncate ${deltaPln >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {deltaPln >= 0 ? '↗ +' : '↘ '}{formatCurrency(deltaPln, 'PLN')}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const NetWorth = ({ cashData, loansData, eurPlnRate }) => {
  if (!cashData || !cashData.by_currency) return null;
  const sumPln = (byCur) => {
    let total = 0;
    for (const [cur, v] of Object.entries(byCur || {})) {
      if (cur === 'EUR' && eurPlnRate > 0) total += v * eurPlnRate;
      else total += v;
    }
    return total;
  };
  const cashPln = sumPln(cashData.by_currency);

  // Loans: sum of current_balance of all loan accounts (already negative).
  const loanAccs = (loansData && loansData.accounts) || [];
  const debtByCur = {};
  for (const a of loanAccs) {
    const cur = a.currency || 'PLN';
    debtByCur[cur] = (debtByCur[cur] || 0) + (a.current_balance || 0);
  }
  const debtPln = sumPln(debtByCur); // negative number when there's debt
  const netWorth = cashPln + debtPln;
  const hasDebt = loanAccs.length > 0;

  return (
    <Card className={`border-2 ${netWorth >= 0 ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/5'}`} data-testid="net-worth-card">
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
          <p className="text-sm font-semibold flex items-center gap-2 text-foreground">
            <Wallet className="h-4 w-4" />
            Net Worth — Чистый капитал
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    data-testid="net-worth-help"
                    aria-label="Что это"
                  >
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed bg-slate-900 text-slate-100 border border-emerald-500/30">
                  <p className="font-semibold mb-1">Касса − Долги</p>
                  <p className="mb-1.5">Это настоящее «своё» состояние бизнеса: сколько денег осталось бы, если бы прямо сейчас вернуть все займы.</p>
                  <p className="text-muted-foreground">Минус = живёшь на заёмные. Плюс = всё своё.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </p>
          <p className={`text-base sm:text-xl font-bold font-mono ${netWorth >= 0 ? 'text-emerald-400' : 'text-rose-400'}`} data-testid="net-worth-total">
            {netWorth >= 0 ? '+' : ''}{formatCurrency(netWorth, 'PLN')}
          </p>
        </div>
        <div className="grid gap-2 grid-cols-2 sm:grid-cols-3">
          <div className="rounded-md bg-background/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Касса (PLN-экв.)</p>
            <p className={`text-sm font-mono font-medium ${cashPln >= 0 ? 'text-sky-300' : 'text-rose-400'}`}>
              {cashPln >= 0 ? '+' : ''}{formatCurrency(cashPln, 'PLN')}
            </p>
          </div>
          <div className="rounded-md bg-background/40 px-3 py-2">
            <p className="text-xs text-muted-foreground">Долги (PLN-экв.)</p>
            <p className={`text-sm font-mono font-medium ${hasDebt ? 'text-amber-300' : 'text-muted-foreground'}`}>
              {hasDebt ? formatCurrency(debtPln, 'PLN') : '—'}
            </p>
          </div>
          <div className="rounded-md bg-background/40 px-3 py-2 hidden sm:block">
            <p className="text-xs text-muted-foreground">Покрытие долга кассой</p>
            <p className={`text-sm font-mono font-medium ${(!hasDebt || cashPln + debtPln >= 0) ? 'text-emerald-400' : 'text-rose-400'}`}>
              {!hasDebt ? '∞' : `${Math.round((cashPln / Math.max(Math.abs(debtPln), 0.01)) * 100)}%`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const LoansSummary = ({ data, eurPlnRate, onAccountClick }) => {
  if (!data || !data.accounts || data.accounts.length === 0) return null;

  const receivedByCur = data.received_by_cur || {};
  const repaidByCur = data.repaid_by_cur || {};

  // Helper: combine per-currency totals into PLN (for net-change calc)
  const toPln = (byCur) => {
    let total = 0;
    for (const [cur, val] of Object.entries(byCur || {})) {
      if (cur === 'EUR' && eurPlnRate > 0) total += val * eurPlnRate;
      else total += val;
    }
    return total;
  };
  const netChangePln = toPln(receivedByCur) - toPln(repaidByCur);  // +positive = долг вырос

  // Sum of current balances grouped by currency (for the «Остаток долга» card)
  const byCur = {};
  for (const a of data.accounts) {
    const cur = a.currency || 'PLN';
    byCur[cur] = (byCur[cur] || 0) + (a.current_balance || 0);
  }

  // Renders a list of currency amounts (e.g., "+30 000 € / +26 060 zł")
  const MultiCurrencyValue = ({ byCur: cur, prefix = '', emptyLabel = '0', className = '' }) => {
    const entries = Object.entries(cur || {}).filter(([, v]) => Math.abs(v) > 0.005);
    if (entries.length === 0) {
      return <p className={`text-sm sm:text-lg font-bold font-mono ${className}`}>{emptyLabel}</p>;
    }
    return (
      <div className="space-y-0.5">
        {entries.map(([c, v]) => (
          <p key={c} className={`text-sm sm:text-lg font-bold font-mono truncate ${className}`}>
            {prefix}{formatCurrency(v, c)}
          </p>
        ))}
      </div>
    );
  };

  return (
    <Card className="border-amber-500/30 bg-amber-500/5" data-testid="loans-summary">
      <CardContent className="py-3 px-4 space-y-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-sm font-semibold text-amber-300 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Займы / заёмные средства
          </p>
          <p className="text-xs text-muted-foreground">
            {data.accounts.map(a => a.name).join(' • ')}
          </p>
        </div>
        <div className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-4">
          <Card className="border-emerald-500/20">
            <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
              <p className="text-xs text-muted-foreground">Получено за период</p>
              <MultiCurrencyValue byCur={receivedByCur} prefix="+" className="text-emerald-500" />
              <p className="text-xs text-muted-foreground">{data.received_count} опер.</p>
            </CardContent>
          </Card>
          <Card className="border-rose-500/20">
            <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
              <p className="text-xs text-muted-foreground">Погашено</p>
              <MultiCurrencyValue byCur={repaidByCur} prefix="-" className="text-rose-500" />
              <p className="text-xs text-muted-foreground">{data.repaid_count} опер.</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
              <p className="text-xs text-muted-foreground">Чистое изменение долга (PLN)</p>
              <p className={`text-sm sm:text-lg font-bold font-mono truncate ${netChangePln >= 0 ? 'text-amber-400' : 'text-emerald-500'}`}>
                {netChangePln >= 0 ? '+' : ''}{formatCurrency(netChangePln)}
              </p>
              <p className="text-xs text-muted-foreground">{netChangePln >= 0 ? 'долг вырос' : 'долг уменьшился'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
              <p className="text-xs text-muted-foreground">Остаток долга</p>
              <div className="space-y-0.5">
                {Object.entries(byCur).map(([cur, v]) => (
                  <p key={cur} className="text-sm sm:text-lg font-bold font-mono text-amber-300 truncate">
                    {formatCurrency(v, cur)}
                  </p>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Per-account breakdown */}
        {data.per_account && data.per_account.length > 0 && (
          <div className="pt-2 border-t border-amber-500/20 space-y-1.5">
            <p className="text-xs text-muted-foreground">Разбивка по счетам</p>
            {data.per_account.map(pa => {
              const recEntries = Object.entries(pa.received_by_cur || {}).filter(([, v]) => Math.abs(v) > 0.005);
              const repEntries = Object.entries(pa.repaid_by_cur || {}).filter(([, v]) => Math.abs(v) > 0.005);
              const hasOps = pa.received_count > 0 || pa.repaid_count > 0;
              // Net delta = received − repaid, expressed in loan account's own currency.
              const recInOwnCur = (pa.received_by_cur || {})[pa.currency] || 0;
              const repInOwnCur = (pa.repaid_by_cur || {})[pa.currency] || 0;
              const netOwn = recInOwnCur - repInOwnCur;
              return (
                <div
                  key={pa.id}
                  className={`flex items-center justify-between gap-3 flex-wrap text-xs rounded-md bg-background/40 px-2 py-1.5 ${hasOps ? 'cursor-pointer hover:bg-background/70 hover:ring-1 hover:ring-amber-500/30 transition' : ''}`}
                  onClick={hasOps ? () => onAccountClick && onAccountClick(pa.id) : undefined}
                  title={hasOps ? 'Кликните, чтобы увидеть только эти операции' : undefined}
                  data-testid={`loan-acc-row-${pa.id}`}
                >
                  <span className="font-medium min-w-[140px]">{pa.name}</span>
                  <span className="text-emerald-400 font-mono">
                    {recEntries.length > 0
                      ? recEntries.map(([c, v]) => `+${formatCurrency(v, c)}`).join(' / ')
                      : '—'}
                    {pa.received_count > 0 && <span className="text-muted-foreground"> ({pa.received_count})</span>}
                  </span>
                  <span className="text-rose-400 font-mono">
                    {repEntries.length > 0
                      ? repEntries.map(([c, v]) => `-${formatCurrency(v, c)}`).join(' / ')
                      : '—'}
                    {pa.repaid_count > 0 && <span className="text-muted-foreground"> ({pa.repaid_count})</span>}
                  </span>
                  <span
                    className={`font-mono font-medium ${Math.abs(netOwn) < 0.005 ? 'text-muted-foreground' : netOwn > 0 ? 'text-rose-300' : 'text-emerald-300'}`}
                    title="Чистая дельта за период в валюте займа (Получено − Погашено)"
                    data-testid={`loan-acc-net-${pa.id}`}
                  >
                    Δ {netOwn > 0 ? '+' : ''}{formatCurrency(netOwn, pa.currency)}
                  </span>
                  <span className="text-amber-300 font-mono">
                    остаток {formatCurrency(pa.current_balance, pa.currency)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const PeriodSummary = ({ summary, totalCount, eurPlnRate }) => {
  if (!summary || Object.keys(summary).length === 0) return null;
  const currencies = Object.keys(summary);
  const hasMultiCurrency = currencies.length > 1;

  // Total in PLN: convert EUR (and other non-PLN) into PLN using current rate.
  // income_base/expense_base is in SOURCE account's currency, so for EUR
  // accounts it's EUR — we must multiply by eurPlnRate when aggregating.
  let totalIncomePln = 0, totalExpensePln = 0;
  for (const [cur, v] of Object.entries(summary)) {
    const inc = v.income_base || v.income || 0;
    const exp = v.expense_base || v.expense || 0;
    if (cur === 'EUR' && eurPlnRate > 0) {
      totalIncomePln += inc * eurPlnRate;
      totalExpensePln += exp * eurPlnRate;
    } else {
      totalIncomePln += inc;
      totalExpensePln += exp;
    }
  }
  const totalNetPln = totalIncomePln - totalExpensePln;

  return (
    <div className="space-y-2" data-testid="period-summary">
      {currencies.map(cur => {
        const v = summary[cur];
        const net = v.income - v.expense;
        return (
          <div key={cur} className="grid gap-2 sm:gap-3 grid-cols-2 sm:grid-cols-4">
            <Card className="border-emerald-500/20">
              <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
                <p className="text-xs text-muted-foreground">Доходы {hasMultiCurrency ? cur : ''}</p>
                <p className="text-sm sm:text-lg font-bold font-mono text-emerald-500 truncate">
                  +{formatCurrency(v.income, cur)}
                </p>
              </CardContent>
            </Card>
            <Card className="border-rose-500/20">
              <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
                <p className="text-xs text-muted-foreground">Расходы {hasMultiCurrency ? cur : ''}</p>
                <p className="text-sm sm:text-lg font-bold font-mono text-rose-500 truncate">
                  -{formatCurrency(v.expense, cur)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
                <p className="text-xs text-muted-foreground">Баланс {hasMultiCurrency ? cur : ''}</p>
                <p className={`text-sm sm:text-lg font-bold font-mono truncate ${net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  {net >= 0 ? '+' : ''}{formatCurrency(net, cur)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="py-2 px-2 sm:py-3 sm:px-4">
                <p className="text-xs text-muted-foreground">Операций {hasMultiCurrency ? cur : ''}</p>
                <p className="text-sm sm:text-lg font-bold font-mono">{v.count}</p>
              </CardContent>
            </Card>
          </div>
        );
      })}
      {hasMultiCurrency && (
        <Card className="border-primary/20">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-xs text-muted-foreground">
                Итого в PLN{eurPlnRate > 0 ? ` (EUR × ${eurPlnRate})` : ''}:
              </span>
              <div className="flex gap-4 font-mono text-sm">
                <span className="text-emerald-500 font-semibold">+{formatCurrency(totalIncomePln)}</span>
                <span className="text-rose-500 font-semibold">-{formatCurrency(totalExpensePln)}</span>
                <span className={`font-bold ${totalNetPln >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                  = {formatCurrency(totalNetPln)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">Всего: {totalCount}</span>
            </div>
          </CardContent>
        </Card>
      )}
      {!hasMultiCurrency && (
        <div className="text-xs text-muted-foreground text-right">
          Всего операций: {totalCount}
        </div>
      )}
    </div>
  );
};

const MonthPickerPopover = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const selectedDate = value ? new Date(value + '-01') : null;
  // Track the currently displayed month so the calendar opens on the previously
  // selected month (not on today's month). Persists across popover re-opens.
  const [displayMonth, setDisplayMonth] = useState(selectedDate || new Date());

  // Keep displayMonth in sync if the filter value changes from outside.
  useEffect(() => {
    if (selectedDate) setDisplayMonth(selectedDate);
  }, [value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" className="min-w-[160px] justify-start text-left font-normal" data-testid="month-picker-btn">
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(new Date(value + '-01'), 'LLLL yyyy', { locale: ru }) : 'Месяц'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <CalendarUI
          mode="single"
          selected={selectedDate}
          month={displayMonth}
          onMonthChange={setDisplayMonth}
          onSelect={(date) => {
            if (date) {
              onChange(format(date, 'yyyy-MM'));
              setOpen(false);
            }
          }}
          locale={ru}
          data-testid="month-picker-calendar"
        />
      </PopoverContent>
    </Popover>
  );
};

const AccountMultiSelect = ({ accounts, selectedIds, onChange }) => {
  const [open, setOpen] = useState(false);
  // null = all selected (initial state). Empty array [] = explicitly none. Otherwise = subset.
  const allSelected = selectedIds == null || selectedIds.length === accounts.length;
  const noneSelected = Array.isArray(selectedIds) && selectedIds.length === 0;
  const selectedSet = new Set(allSelected ? accounts.map(a => a.id) : (selectedIds || []));

  const toggleOne = (id) => {
    const current = new Set(selectedSet);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    if (current.size === accounts.length) onChange(null);
    else onChange([...current]);
  };

  const toggleAll = () => {
    if (allSelected) onChange([]); // deselect all
    else onChange(null);            // select all
  };

  const label = allSelected
    ? 'Все счета'
    : noneSelected
    ? 'Счета: ни одного'
    : selectedSet.size === 1
    ? accounts.find(a => selectedSet.has(a.id))?.name
    : `Счета: ${selectedSet.size} из ${accounts.length}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="justify-start text-left font-normal min-w-0"
          data-testid="filter-account"
        >
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="flex items-center gap-2 p-2 border-b border-border mb-1">
          <Checkbox
            checked={allSelected}
            onCheckedChange={toggleAll}
            id="acc-filter-all"
            data-testid="filter-account-all"
          />
          <label htmlFor="acc-filter-all" className="text-sm font-medium cursor-pointer flex-1">
            {allSelected ? 'Снять все' : 'Выбрать все'}
          </label>
        </div>
        <div className="max-h-64 overflow-y-auto space-y-1">
          {accounts.map(a => (
            <div key={a.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted/50">
              <Checkbox
                checked={selectedSet.has(a.id)}
                onCheckedChange={() => toggleOne(a.id)}
                id={`acc-filter-${a.id}`}
                data-testid={`filter-account-${a.id}`}
              />
              <label htmlFor={`acc-filter-${a.id}`} className="text-sm cursor-pointer flex-1 truncate">
                {a.name}
                <span className="text-xs text-muted-foreground ml-1">({a.currency})</span>
              </label>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};




export const TransactionsPage = () => {
  const { api } = useAuth();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [eurPlnRate, setEurPlnRate] = useState(0);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [directions, setDirections] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [documents, setDocuments] = useState([]);
  
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [transactionType, setTransactionType] = useState('expense');
  const [lastEditedId, setLastEditedId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [createRuleOpen, setCreateRuleOpen] = useState(false);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [analyzePendingOpen, setAnalyzePendingOpen] = useState(false);
  const [pendingReceiptsCount, setPendingReceiptsCount] = useState(0);
  const [createRuleData, setCreateRuleData] = useState({
    pattern: '',
    category_id: '',
    direction_id: '',
    apply_to_existing: true,
    source_tx: null,
  });
  const [savingRule, setSavingRule] = useState(false);
  
  // Document linking state
  const [linkDocDialogOpen, setLinkDocDialogOpen] = useState(false);
  const [selectedTransactionForDoc, setSelectedTransactionForDoc] = useState(null);
  const [transactionDocuments, setTransactionDocuments] = useState({});
  
  const STORAGE_KEY = 'wm:transactions:state';

  const [filters, setFilters] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.filters) return parsed.filters;
      }
    } catch (e) { /* ignore */ }
    return {
      period: 'current_month',
      customMonth: '',
      customDateFrom: '',
      customDateTo: '',
      type: 'all',
      status: 'all',
      account_id: 'all',           // legacy single-select (kept for backwards compat)
      selectedAccountIds: null,    // null = all; otherwise array of selected ids
      direction_id: 'all',
      category_id: 'all',
      needs_review: 'all',
      search: ''
    };
  });

  const [page, setPage] = useState(() => {
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.page) return parsed.page;
      }
    } catch (e) { /* ignore */ }
    return 1;
  });
  const [perPage] = useState(50);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [summary, setSummary] = useState({});
  const [loansSummary, setLoansSummary] = useState(null);
  const [cashSummary, setCashSummary] = useState(null);

  const [formData, setFormData] = useState({
    date: todayLocal(),
    type: 'expense',
    amount: '',
    currency: 'PLN',
    category_id: '',
    direction_id: '',
    account_id: '',
    to_account_id: '',
    to_amount: '',
    manual_rate: '',
    contractor_id: '',
    description: '',
    status: 'fact',
    is_recurring: false
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      let dates;
      if (filters.period === 'custom_month' && filters.customMonth) {
        const [y, m] = filters.customMonth.split('-');
        const lastDay = new Date(Number(y), Number(m), 0).getDate();
        dates = { from: `${filters.customMonth}-01`, to: `${filters.customMonth}-${lastDay}` };
      } else if (filters.period === 'custom_range') {
        dates = {
          from: filters.customDateFrom || undefined,
          to: filters.customDateTo || undefined,
        };
      } else {
        dates = getPeriodDates(filters.period);
      }

      // Multi-account filter:
      //   null  → all accounts (no filter sent)
      //   []    → explicitly "none" — send a sentinel that matches nothing
      //   [..] of length < total → send comma-separated list
      //   [..] of length === total → all accounts (no filter sent)
      let accountIdsParam = null;
      if (Array.isArray(filters.selectedAccountIds)) {
        if (filters.selectedAccountIds.length === 0) {
          accountIdsParam = '__none__';
        } else if (filters.selectedAccountIds.length < accounts.length) {
          accountIdsParam = filters.selectedAccountIds.join(',');
        }
      }

      const params = {
        ...(dates.from && { date_from: dates.from }),
        ...(dates.to && { date_to: dates.to }),
        page,
        per_page: perPage,
        ...(filters.type && filters.type !== 'all' && { type: filters.type }),
        ...(filters.status && filters.status !== 'all' && { status: filters.status }),
        ...(accountIdsParam ? { account_ids: accountIdsParam }
            : (filters.account_id && filters.account_id !== 'all' && { account_id: filters.account_id })),
        ...(filters.direction_id && filters.direction_id !== 'all' && { direction_id: filters.direction_id }),
        ...(filters.category_id && filters.category_id !== 'all' && { category_id: filters.category_id }),
        ...(filters.needs_review && filters.needs_review !== 'all' && { needs_review: filters.needs_review === 'yes' }),
        ...(filters.search && { search: filters.search })
      };
      
      const [transRes, accountsRes, categoriesRes, directionsRes, contractorsRes, docsRes, rateRes] = await Promise.all([
        api().get('/transactions', { params }),
        api().get('/accounts'),
        api().get('/categories'),
        api().get('/directions'),
        api().get('/contractors'),
        api().get('/documents', { params: { status: 'pending' } }),
        api().get('/exchange-rate').catch(() => ({ data: { eur_pln: 0 } })),
      ]);
      
      const paginated = transRes.data;
      setTransactions(paginated.items || []);
      setTotalItems(paginated.total || 0);
      setTotalPages(paginated.pages || 1);
      setSummary(paginated.summary || {});
      setLoansSummary(paginated.loans_summary || null);
      setCashSummary(paginated.cash_summary || null);
      setAccounts(accountsRes.data);
      setCategories(categoriesRes.data);
      setDirections(directionsRes.data);
      setContractors(contractorsRes.data);
      setDocuments(docsRes.data);
      setEurPlnRate(rateRes.data.eur_pln || 0);
    } catch (error) {
      toast.error('Ошибка загрузки данных');
    } finally {
      setLoading(false);
    }
  }, [api, filters, page, perPage]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Persist filters + page to sessionStorage so they survive navigation away & back.
  // Scroll Y is persisted on unmount (below).
  const isFirstRender = useRef(true);
  useEffect(() => {
    try {
      const existing = sessionStorage.getItem(STORAGE_KEY);
      const prev = existing ? JSON.parse(existing) : {};
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, filters, page }));
    } catch (e) { /* ignore */ }
  }, [filters, page]);

  // Poll pending receipts count (badge on "Анализ чеков" button)
  const refreshPendingCount = useCallback(async () => {
    try {
      const r = await api().get('/receipts/unmatched');
      setPendingReceiptsCount(r.data?.total || 0);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshPendingCount();
    const t = setInterval(refreshPendingCount, 30000);
    return () => clearInterval(t);
  }, [refreshPendingCount]);

  // Restore scroll position after the first data load, then save it on unmount.
  useEffect(() => {
    if (loading) return;
    if (!isFirstRender.current) return;
    isFirstRender.current = false;
    try {
      const saved = sessionStorage.getItem(STORAGE_KEY);
      const parsed = saved ? JSON.parse(saved) : null;
      const y = parsed?.scrollY;
      if (typeof y === 'number' && y > 0) {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => window.scrollTo({ top: y, behavior: 'instant' }));
        });
      }
    } catch (e) { /* ignore */ }
  }, [loading]);

  useEffect(() => {
    // Save scroll Y whenever it changes (debounced via requestAnimationFrame)
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        try {
          const saved = sessionStorage.getItem(STORAGE_KEY);
          const prev = saved ? JSON.parse(saved) : {};
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ ...prev, scrollY: window.scrollY }));
        } catch (e) { /* ignore */ }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Reset to page 1 when filters change (but NOT on the initial restore from storage)
  const filtersInitDone = useRef(false);
  useEffect(() => {
    if (!filtersInitDone.current) {
      filtersInitDone.current = true;
      return;
    }
    setPage(1);
  }, [filters]);

  const toggleNeedsReview = async (e, transactionId) => {
    e.stopPropagation();
    try {
      const res = await api().put(`/transactions/${transactionId}/review`);
      setTransactions(prev => prev.map(t => t.id === transactionId ? { ...t, needs_review: res.data.needs_review } : t));
    } catch {
      toast.error('Ошибка обновления');
    }
  };

  const openCreateRuleDialog = (t) => {
    const desc = (t.description || '').trim();
    let suggested = desc.slice(0, 20);
    const words = desc.split(/[\s,.;:\-/()]+/).filter(w => w.length >= 4);
    if (words.length > 0) {
      words.sort((a, b) => b.length - a.length);
      suggested = words[0].slice(0, 25);
    }
    setCreateRuleData({
      pattern: suggested,
      category_id: t.category_id || '',
      direction_id: t.direction_id || '',
      apply_to_existing: true,
      source_tx: t,
    });
    setCreateRuleOpen(true);
  };

  const saveRule = async () => {
    const pattern = (createRuleData.pattern || '').trim();
    if (!pattern) {
      toast.error('Введите паттерн');
      return;
    }
    if (!createRuleData.category_id && !createRuleData.direction_id) {
      toast.error('Выберите Статью и/или Направление');
      return;
    }
    setSavingRule(true);
    try {
      const rulePayload = { pattern, is_active: true };
      if (createRuleData.category_id) rulePayload.category_id = createRuleData.category_id;
      if (createRuleData.direction_id) rulePayload.direction_id = createRuleData.direction_id;
      await api().post('/auto-rules', rulePayload);

      let applied = 0;
      if (createRuleData.apply_to_existing) {
        // Backend caps per_page at 200 — paginate if needed.
        const collected = [];
        for (let p = 1; p <= 10; p++) {
          const resp = await api().get('/transactions', { params: { search: pattern, per_page: 200, page: p } });
          const items = (resp.data?.items || resp.data || []);
          collected.push(...items.map(x => x.id));
          if (items.length < 200) break;
        }
        if (collected.length > 0) {
          const r = await api().post('/transactions/bulk-apply-rules', { ids: collected, overwrite: false });
          applied = r.data?.updated || 0;
        }
      }
      toast.success(applied > 0
        ? `Правило создано · обновлено ${applied} существующих операций`
        : 'Правило создано');
      setCreateRuleOpen(false);
      const scrollY = window.scrollY;
      await fetchData();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
      });
    } catch (e) {
      // Normalise the error message — FastAPI returns array of objects for 422
      const raw = e.response?.data?.detail;
      const msg = typeof raw === 'string'
        ? raw
        : Array.isArray(raw)
          ? raw.map(x => x?.msg || JSON.stringify(x)).join('; ')
          : 'Ошибка создания правила';
      toast.error(msg);
    } finally {
      setSavingRule(false);
    }
  };

  // Open document linking dialog
  const openLinkDocDialog = async (transaction) => {
    setSelectedTransactionForDoc(transaction);
    setLinkDocDialogOpen(true);
    
    // Fetch linked documents for this transaction
    try {
      const res = await api().get(`/transactions/${transaction.id}/documents`);
      setTransactionDocuments(prev => ({ ...prev, [transaction.id]: res.data }));
    } catch (error) {
      console.error('Error fetching transaction documents:', error);
    }
  };

  // Link document to transaction
  const linkDocument = async (documentId) => {
    if (!selectedTransactionForDoc) return;
    
    try {
      await api().post(`/documents/${documentId}/link-transaction?transaction_id=${selectedTransactionForDoc.id}`);
      toast.success('Документ прикреплён');
      
      // Refresh documents
      const res = await api().get(`/transactions/${selectedTransactionForDoc.id}/documents`);
      setTransactionDocuments(prev => ({ ...prev, [selectedTransactionForDoc.id]: res.data }));
      
      // Refresh pending documents list
      const docsRes = await api().get('/documents', { params: { status: 'pending' } });
      setDocuments(docsRes.data);
    } catch (error) {
      toast.error('Ошибка прикрепления документа');
    }
  };

  // Unlink document from transaction
  const unlinkDocument = async (documentId) => {
    if (!selectedTransactionForDoc) return;
    
    try {
      await api().delete(`/documents/${documentId}/unlink`);
      toast.success('Документ откреплён');
      
      // Refresh documents
      const res = await api().get(`/transactions/${selectedTransactionForDoc.id}/documents`);
      setTransactionDocuments(prev => ({ ...prev, [selectedTransactionForDoc.id]: res.data }));
      
      // Refresh pending documents list
      const docsRes = await api().get('/documents', { params: { status: 'pending' } });
      setDocuments(docsRes.data);
    } catch (error) {
      toast.error('Ошибка открепления документа');
    }
  };

  const openNewTransaction = (type) => {
    // 'exchange' is a UI-only type — under the hood it's a transfer with is_exchange=true
    const isExchange = type === 'exchange';
    const effectiveType = isExchange ? 'transfer' : type;
    setTransactionType(isExchange ? 'exchange' : type);
    setEditingTransaction(null);
    setFormData({
      date: todayLocal(),
      type: effectiveType,
      amount: '',
      currency: 'PLN',
      category_id: '',
      direction_id: directions[0]?.id || '',
      account_id: accounts[0]?.id || '',
      to_account_id: '',
      to_amount: '',
      manual_rate: '',
      contractor_id: '',
      description: '',
      status: 'fact',
      is_recurring: false,
      is_exchange: isExchange,
    });
    setDialogOpen(true);
  };

  const openEditTransaction = (transaction) => {
    // For UI purposes, an "exchange" is a transfer with is_exchange=true
    const uiType = transaction.is_exchange ? 'exchange' : transaction.type;
    setTransactionType(uiType);
    setEditingTransaction(transaction);
    const fromAcc = accounts.find(a => a.id === transaction.account_id);
    const toAcc = accounts.find(a => a.id === transaction.to_account_id);
    const fromCur = fromAcc?.currency || transaction.currency;
    const toCur = toAcc?.currency;
    const isXCur = transaction.type === 'transfer' && toAcc && toCur !== fromCur;
    const initialToAmount = isXCur && transaction.to_amount_base != null
      ? String(transaction.to_amount_base) : '';
    // Rate convention: "1 [foreign] = X PLN" when PLN involved; otherwise "1 fromCur = X toCur"
    let initialRate = '';
    if (isXCur && transaction.amount && transaction.to_amount_base) {
      const plnAnchored = fromCur === 'PLN' || toCur === 'PLN';
      if (plnAnchored) {
        initialRate = fromCur === 'PLN'
          ? String(Number((transaction.amount / transaction.to_amount_base).toFixed(6)))
          : String(Number((transaction.to_amount_base / transaction.amount).toFixed(6)));
      } else {
        initialRate = String(Number((transaction.to_amount_base / transaction.amount).toFixed(6)));
      }
    }
    setFormData({
      date: transaction.date,
      type: transaction.type,
      amount: transaction.amount.toString(),
      currency: transaction.type === 'transfer' ? fromCur : transaction.currency,
      category_id: transaction.category_id || '',
      direction_id: transaction.direction_id,
      account_id: transaction.account_id,
      to_account_id: transaction.to_account_id || '',
      to_amount: initialToAmount,
      manual_rate: initialRate,
      contractor_id: transaction.contractor_id || '',
      description: transaction.description || '',
      status: transaction.status,
      is_recurring: transaction.is_recurring,
      is_exchange: !!transaction.is_exchange,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!formData.amount || !formData.direction_id || !formData.account_id) {
      toast.error('Заполните обязательные поля');
      return;
    }

    try {
      const isExchangeUI = transactionType === 'exchange';
      const effectiveType = isExchangeUI ? 'transfer' : transactionType;
      const fromAcc = accounts.find(a => a.id === formData.account_id);
      const toAcc = accounts.find(a => a.id === formData.to_account_id);
      // For transfers, source currency = from-account currency (always)
      const txCurrency = effectiveType === 'transfer' && fromAcc ? fromAcc.currency : formData.currency;
      const isXCur = effectiveType === 'transfer' && toAcc && fromAcc && toAcc.currency !== fromAcc.currency;
      const payload = {
        ...formData,
        currency: txCurrency,
        type: effectiveType,  // ← взять из кнопок, а не из устаревшего formData.type
        amount: parseFloat(formData.amount),
        category_id: formData.category_id === 'none' ? null : formData.category_id,
        contractor_id: formData.contractor_id === 'none' ? null : formData.contractor_id,
        to_account_id: effectiveType === 'transfer' ? (formData.to_account_id || null) : null,
        to_amount: (isXCur && formData.to_amount) ? parseFloat(formData.to_amount) : null,
        is_exchange: isExchangeUI,
      };
      // Strip helper-only fields the backend doesn't know about
      delete payload.manual_rate;

      const editedId = editingTransaction?.id || null;
      if (editingTransaction) {
        await api().put(`/transactions/${editingTransaction.id}`, payload);
        toast.success('Операция обновлена');
      } else {
        await api().post('/transactions', payload);
        toast.success('Операция создана');
      }

      // Preserve scroll position across the re-fetch so the user stays where
      // they were when editing a row deep in the list
      const scrollY = window.scrollY;
      setDialogOpen(false);
      await fetchData();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
      });

      // Highlight the edited row briefly
      if (editedId) {
        setLastEditedId(editedId);
        setTimeout(() => setLastEditedId((cur) => (cur === editedId ? null : cur)), 1800);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Ошибка сохранения');
    }
  };

  const handleDelete = async (id) => {
    try {
      await api().delete(`/transactions/${id}`);
      toast.success('Операция удалена');
      const scrollY = window.scrollY;
      await fetchData();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
      });
    } catch (error) {
      toast.error('Ошибка удаления');
    }
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    if (!window.confirm(`Удалить ${ids.length} ${ids.length === 1 ? 'операцию' : 'операций'}? Действие необратимо.`)) return;
    setBulkDeleting(true);
    try {
      const res = await api().post('/transactions/bulk-delete', { ids });
      toast.success(`Удалено: ${res.data.deleted}`);
      setSelectedIds(new Set());
      const scrollY = window.scrollY;
      await fetchData();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
      });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка массового удаления');
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleBulkApplyRules = async (overwrite = false) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const msg = overwrite
      ? `Применить авто-правила и ПЕРЕЗАПИСАТЬ существующие Статью/Направление у ${ids.length} операций?`
      : `Применить авто-правила к ${ids.length} ${ids.length === 1 ? 'операции' : 'операциям'} (заполнятся только пустые Статья/Направление)?`;
    if (!window.confirm(msg)) return;
    setBulkUpdating(true);
    try {
      const res = await api().post('/transactions/bulk-apply-rules', { ids, overwrite });
      const d = res.data;
      toast.success(`Обновлено: ${d.updated} · без совпадений: ${d.no_match}${d.skipped ? ` · пропущено: ${d.skipped}` : ''}`);
      setSelectedIds(new Set());
      const scrollY = window.scrollY;
      await fetchData();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
      });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка применения правил');
    } finally {
      setBulkUpdating(false);
    }
  };

  const handleBulkUpdate = async ({ category_id, direction_id }) => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkUpdating(true);
    try {
      const payload = { ids };
      if (category_id) payload.category_id = category_id;
      if (direction_id) payload.direction_id = direction_id;
      const res = await api().post('/transactions/bulk-update', payload);
      toast.success(`Обновлено: ${res.data.modified}`);
      setSelectedIds(new Set());
      const scrollY = window.scrollY;
      await fetchData();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => window.scrollTo({ top: scrollY, behavior: 'instant' }));
      });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Ошибка массового обновления');
    } finally {
      setBulkUpdating(false);
    }
  };

  const filteredCategories = categories.filter(c => 
    (transactionType === 'transfer' || transactionType === 'exchange') ? true : c.type === transactionType
  );

  const SourceIcon = ({ source }) => {
    const Icon = sourceIcons[source] || Pencil;
    return <Icon className="h-4 w-4 text-muted-foreground" />;
  };

  return (
    <div className="p-6 md:p-8 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Операции</h1>
          <p className="text-muted-foreground">
            Управление доходами и расходами
            {totalItems > 0 && <Badge variant="secondary" className="ml-2">{totalItems}</Badge>}
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button onClick={() => openNewTransaction('income')} className="bg-emerald-600 hover:bg-emerald-700" data-testid="add-income-btn">
            <Plus className="h-4 w-4 mr-2" />
            Приход
          </Button>
          <Button onClick={() => openNewTransaction('expense')} variant="destructive" data-testid="add-expense-btn">
            <Minus className="h-4 w-4 mr-2" />
            Расход
          </Button>
          <Button onClick={() => openNewTransaction('transfer')} variant="secondary" data-testid="add-transfer-btn">
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Перевод
          </Button>
          <Button
            onClick={() => openNewTransaction('exchange')}
            className="bg-amber-500 hover:bg-amber-600 text-white"
            data-testid="add-exchange-btn"
          >
            <ArrowLeftRight className="h-4 w-4 mr-2" />
            Обмен валюты
          </Button>
          <Button
            onClick={() => setReceiptDialogOpen(true)}
            variant="outline"
            className="border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
            data-testid="upload-receipt-btn"
          >
            <Receipt className="h-4 w-4 mr-2" />
            Загрузить чек
          </Button>
          <Button
            onClick={() => setAnalyzePendingOpen(true)}
            variant="outline"
            className="relative border-amber-500/40 text-amber-400 hover:bg-amber-500/10"
            disabled={pendingReceiptsCount === 0}
            data-testid="analyze-receipts-btn"
          >
            <Receipt className="h-4 w-4 mr-2" />
            Проанализировать чеки
            {pendingReceiptsCount > 0 && (
              <span className="ml-2 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-amber-500 text-white text-xs font-bold">
                {pendingReceiptsCount}
              </span>
            )}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-8">
            <div className="lg:col-span-2 flex gap-2">
              <Select value={filters.period} onValueChange={(v) => setFilters({ ...filters, period: v, customMonth: v === 'custom_month' ? filters.customMonth : '', customDateFrom: v === 'custom_range' ? filters.customDateFrom : '', customDateTo: v === 'custom_range' ? filters.customDateTo : '' })}>
                <SelectTrigger data-testid="filter-period" className="flex-1">
                  <Calendar className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Период" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Текущий месяц</SelectItem>
                  <SelectItem value="prev_month">Прошлый месяц</SelectItem>
                  <SelectItem value="custom_month">Конкретный месяц</SelectItem>
                  <SelectItem value="custom_range">Диапазон дат</SelectItem>
                  <SelectItem value="quarter">Квартал</SelectItem>
                  <SelectItem value="year">Текущий год</SelectItem>
                  <SelectItem value="year_2025">2025 год</SelectItem>
                  <SelectItem value="year_2024">2024 год</SelectItem>
                  <SelectItem value="year_2023">2023 год</SelectItem>
                  <SelectItem value="all_time">Всё время</SelectItem>
                </SelectContent>
              </Select>

              {filters.period === 'custom_month' && (
                <MonthPickerPopover
                  value={filters.customMonth}
                  onChange={(v) => setFilters({ ...filters, customMonth: v })}
                />
              )}
            </div>

            {filters.period === 'custom_range' && (
              <div className="lg:col-span-2 flex gap-2 items-center">
                <Input
                  type="date"
                  value={filters.customDateFrom}
                  onChange={(e) => setFilters({ ...filters, customDateFrom: e.target.value })}
                  className="flex-1"
                  data-testid="filter-date-from"
                />
                <span className="text-muted-foreground text-sm">—</span>
                <Input
                  type="date"
                  value={filters.customDateTo}
                  onChange={(e) => setFilters({ ...filters, customDateTo: e.target.value })}
                  className="flex-1"
                  data-testid="filter-date-to"
                />
              </div>
            )}

            <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
              <SelectTrigger data-testid="filter-type">
                <SelectValue placeholder="Тип" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все типы</SelectItem>
                <SelectItem value="income">Приход</SelectItem>
                <SelectItem value="expense">Расход</SelectItem>
                <SelectItem value="transfer">Перевод</SelectItem>
                <SelectItem value="exchange">Обмен валюты</SelectItem>
              </SelectContent>
            </Select>

            <AccountMultiSelect
              accounts={accounts}
              selectedIds={filters.selectedAccountIds}
              onChange={(ids) => setFilters({ ...filters, selectedAccountIds: ids, account_id: 'all' })}
            />

            <Select value={filters.direction_id} onValueChange={(v) => setFilters({ ...filters, direction_id: v })}>
              <SelectTrigger data-testid="filter-direction">
                <SelectValue placeholder="Направление" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все направления</SelectItem>
                {directions.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.category_id} onValueChange={(v) => setFilters({ ...filters, category_id: v })}>
              <SelectTrigger data-testid="filter-category">
                <SelectValue placeholder="Статья" />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                <SelectItem value="all">Все статьи</SelectItem>
                {[...categories].sort((a, b) => a.name.localeCompare(b.name, 'ru')).map(c => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.type === 'income' ? '↑ ' : '↓ '}{c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
              <SelectTrigger data-testid="filter-status">
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="fact">Факт</SelectItem>
                <SelectItem value="plan">План</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filters.needs_review} onValueChange={(v) => setFilters({ ...filters, needs_review: v })}>
              <SelectTrigger data-testid="filter-needs-review">
                <AlertTriangle className="h-4 w-4 mr-2 text-amber-500" />
                <SelectValue placeholder="Под вопросом" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="yes">Под вопросом</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input 
                placeholder="Поиск..." 
                className="pl-9"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                data-testid="filter-search"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Period Summary */}
      {!loading && totalItems > 0 && (
        <PeriodSummary summary={summary} totalCount={totalItems} eurPlnRate={eurPlnRate} />
      )}

      {/* Cash on hand (current balance of asset accounts, includes loan funds already received) */}
      {!loading && cashSummary && (
        <CashOnHand data={cashSummary} eurPlnRate={eurPlnRate} />
      )}

      {/* Net Worth — Cash − Debt (real financial state) */}
      {!loading && cashSummary && (
        <NetWorth cashData={cashSummary} loansData={loansSummary} eurPlnRate={eurPlnRate} />
      )}

      {/* Loans summary block (separate from main income/expense) */}
      {!loading && loansSummary && (loansSummary.accounts || []).length > 0 && (
        <LoansSummary
          data={loansSummary}
          eurPlnRate={eurPlnRate}
          onAccountClick={(accId) => {
            setFilters(prev => ({
              ...prev,
              type: 'transfer',
              selectedAccountIds: [accId],
              account_id: 'all',
            }));
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }}
        />
      )}

      {/* Transactions Table */}
      {/* Bulk action bar — appears when at least one row is selected */}
      {selectedIds.size > 0 && (
        <Card className="border-primary/40 bg-primary/5 sticky top-4 z-20">
          <CardContent className="p-3 flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium">
              Выделено: <span className="font-bold">{selectedIds.size}</span>
              {selectedIds.size === 1 ? ' операция' : ' операций'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              data-testid="clear-selection-btn"
            >
              Снять выделение
            </Button>

            <div className="h-6 w-px bg-border mx-1" />

            {/* Bulk: change category */}
            <Select
              value=""
              disabled={bulkUpdating}
              onValueChange={(value) => { if (value) handleBulkUpdate({ category_id: value }); }}
            >
              <SelectTrigger className="w-[200px] h-9" data-testid="bulk-category-select">
                <SelectValue placeholder="Сменить статью..." />
              </SelectTrigger>
              <SelectContent>
                {categories.filter(c => c.is_active !== false).map(c => (
                  <SelectItem key={c.id} value={c.id} data-testid={`bulk-cat-option-${c.id}`}>
                    <span className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs px-1.5 py-0">
                        {c.type === 'income' ? '+' : c.type === 'expense' ? '−' : '↔'}
                      </Badge>
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Bulk: change direction */}
            <Select
              value=""
              disabled={bulkUpdating}
              onValueChange={(value) => { if (value) handleBulkUpdate({ direction_id: value }); }}
            >
              <SelectTrigger className="w-[200px] h-9" data-testid="bulk-direction-select">
                <SelectValue placeholder="Сменить направление..." />
              </SelectTrigger>
              <SelectContent>
                {directions.filter(d => d.is_active !== false).map(d => (
                  <SelectItem key={d.id} value={d.id} data-testid={`bulk-dir-option-${d.id}`}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {bulkUpdating && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkApplyRules(false)}
              disabled={bulkUpdating}
              title="Применить авто-правила (заполнить пустые Статью/Направление)"
              data-testid="bulk-apply-rules-btn"
            >
              <Bot className="h-4 w-4 mr-2" />
              Применить авто-правила
            </Button>

            <div className="flex-1" />
            <Button
              variant="destructive"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              data-testid="bulk-delete-btn"
            >
              {bulkDeleting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-2" />
              )}
              Удалить выделенные
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-6 space-y-4">
              {[1,2,3,4,5].map(i => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : transactions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-muted-foreground mb-4">Нет операций за выбранный период</p>
              <Button onClick={() => openNewTransaction('income')} data-testid="empty-add-btn">
                <Plus className="h-4 w-4 mr-2" />
                Добавить операцию
              </Button>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={transactions.length > 0 && transactions.every(t => selectedIds.has(t.id))}
                      onCheckedChange={(checked) => {
                        const next = new Set(selectedIds);
                        if (checked) transactions.forEach(t => next.add(t.id));
                        else transactions.forEach(t => next.delete(t.id));
                        setSelectedIds(next);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      data-testid="select-all-checkbox"
                    />
                  </TableHead>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Дата</TableHead>
                  <TableHead>Сумма</TableHead>
                  <TableHead>Статья / Описание</TableHead>
                  <TableHead>Направление</TableHead>
                  <TableHead>Контрагент</TableHead>
                  <TableHead>Счёт</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((t) => (
                  <TableRow
                    key={t.id}
                    className={cn(
                      "table-row-hover cursor-pointer transition-colors",
                      lastEditedId === t.id && "bg-amber-500/15 animate-pulse-once",
                      selectedIds.has(t.id) && "bg-primary/5"
                    )}
                    onClick={() => openEditTransaction(t)}
                    data-testid={`transaction-row-${t.id}`}
                    data-source={t.source || ''}
                  >
                    <TableCell
                      onClick={(e) => e.stopPropagation()}
                      className={cn(
                        typeof t.source === 'string' && t.source.startsWith('telegram') && "border-l-[3px] border-l-sky-500"
                      )}
                    >
                      <Checkbox
                        checked={selectedIds.has(t.id)}
                        onCheckedChange={(checked) => {
                          const next = new Set(selectedIds);
                          if (checked) next.add(t.id);
                          else next.delete(t.id);
                          setSelectedIds(next);
                        }}
                        data-testid={`row-checkbox-${t.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <SourceIcon source={t.source} />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      <div className="leading-tight">
                        <div>{formatDate(t.date)}</div>
                        {t.created_at && (
                          <div
                            className="text-[10px] text-muted-foreground/70 mt-0.5"
                            title={`Создано: ${formatDateTime(t.created_at)}`}
                            data-testid={`tx-created-at-${t.id}`}
                          >
                            {formatTime(t.created_at)}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const isAccountFiltered = filters.account_id && filters.account_id !== 'all';
                        const isTransferIn = t.type === 'transfer' && isAccountFiltered && t.to_account_id === filters.account_id;
                        const isTransferOut = t.type === 'transfer' && isAccountFiltered && t.account_id === filters.account_id;

                        const colorClass = t.type === 'income' ? 'text-emerald-500'
                          : t.type === 'expense' ? 'text-rose-500'
                          : t.is_exchange ? 'text-amber-400'
                          : isTransferIn ? 'text-emerald-500'
                          : isTransferOut ? 'text-rose-500'
                          : 'text-sky-500';

                        const sign = t.type === 'income' ? '+'
                          : t.type === 'expense' ? '-'
                          : isTransferIn ? '+'
                          : isTransferOut ? '-'
                          : '';

                        // For incoming cross-currency transfers, show to_amount_base
                        const displayAmount = isTransferIn && t.to_amount_base && t.to_amount_base !== t.amount
                          ? t.to_amount_base : t.amount;
                        // Currency to display for incoming cross-currency transfers
                        const displayCurrency = isTransferIn && t.to_amount_base && t.to_amount_base !== t.amount
                          ? (accounts.find(a => a.id === filters.account_id)?.currency || t.currency) : t.currency;

                        return (
                          <>
                            <span className={`font-mono font-semibold ${colorClass}`} data-testid={`amount-${t.id}`}>
                              {sign}{formatCurrency(displayAmount, displayCurrency)}
                            </span>
                            {t.type === 'transfer' && isAccountFiltered ? (
                              <p className={`text-xs font-medium mt-0.5 ${isTransferIn ? 'text-emerald-400/70' : 'text-rose-400/70'}`} data-testid={`transfer-direction-${t.id}`}>
                                {isTransferIn ? '↓ Приход' : '↑ Расход'}
                              </p>
                            ) : t.amount_base && t.amount_base !== t.amount && t.exchange_rate ? (
                              <p className="text-xs text-muted-foreground font-mono">
                                ≈ {formatCurrency(t.amount_base, 'PLN')}
                              </p>
                            ) : (
                              <p className="text-xs text-muted-foreground font-mono">
                                {formatCurrency(t.balance_after, t.currency)}
                              </p>
                            )}
                          </>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <div>
                          <p className="font-medium">{t.category_name || 'Без категории'}</p>
                          {t.description && <p className="text-sm text-muted-foreground truncate max-w-48">{t.description}</p>}
                        </div>
                        {t.needs_review && (
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" title="Под вопросом" />
                        )}
                        {t.has_attachment && (
                          <AttachmentThumb
                            transactionId={t.id}
                            onUnlinked={fetchData}
                          />
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getDirectionClass(t.direction_name)}>
                        {t.direction_name}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{t.contractor_name || '-'}</TableCell>
                    <TableCell>
                      {t.type === 'transfer' && t.to_account_name
                        ? <span>{t.account_name} <span className="text-muted-foreground">→</span> {t.to_account_name}</span>
                        : t.account_name}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" data-testid={`transaction-menu-${t.id}`}>
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEditTransaction(t); }}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Редактировать
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openLinkDocDialog(t); }}>
                            <Paperclip className="h-4 w-4 mr-2" />
                            Документы
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openCreateRuleDialog(t); }}>
                            <Bot className="h-4 w-4 mr-2" />
                            Создать правило из операции
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => toggleNeedsReview(e, t.id)}>
                            <AlertTriangle className="h-4 w-4 mr-2" />
                            {t.needs_review ? 'Снять отметку "Под вопросом"' : 'Отметить "Под вопросом"'}
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="text-destructive">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Удалить
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Удалить операцию?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Это действие нельзя отменить. Операция будет удалена навсегда.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Отмена</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(t.id)} data-testid="confirm-delete-btn">
                                  Удалить
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between" data-testid="pagination">
          <p className="text-sm text-muted-foreground">
            Показано {((page - 1) * perPage) + 1}–{Math.min(page * perPage, totalItems)} из {totalItems}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(1)} data-testid="page-first">
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage(p => p - 1)} data-testid="page-prev">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm font-medium">{page} / {totalPages}</span>
            <Button variant="secondary" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} data-testid="page-next">
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="secondary" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage(totalPages)} data-testid="page-last">
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Document Linking Dialog */}
      <Dialog open={linkDocDialogOpen} onOpenChange={setLinkDocDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Paperclip className="h-5 w-5" />
              Документы операции
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Linked documents */}
            {selectedTransactionForDoc && transactionDocuments[selectedTransactionForDoc.id]?.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Link2 className="h-4 w-4" />
                  Прикреплённые документы
                </h4>
                <div className="space-y-2">
                  {transactionDocuments[selectedTransactionForDoc.id].map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate max-w-[200px]">{doc.file_name}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => unlinkDocument(doc.id)}
                        data-testid={`unlink-doc-${doc.id}`}
                      >
                        <Unlink className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Available documents to link */}
            {documents.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2">Доступные документы</h4>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg border border-border hover:bg-muted/50">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <span className="truncate max-w-[200px] block">{doc.file_name}</span>
                          <span className="text-xs text-muted-foreground">{doc.type}</span>
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => linkDocument(doc.id)}
                        data-testid={`link-doc-${doc.id}`}
                      >
                        <Link2 className="h-4 w-4 mr-1" />
                        Прикрепить
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {documents.length === 0 && (!selectedTransactionForDoc || !transactionDocuments[selectedTransactionForDoc.id]?.length) && (
              <p className="text-muted-foreground text-center py-4">
                Нет доступных документов. Загрузите документы на странице "Документы".
              </p>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDocDialogOpen(false)}>
              Закрыть
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingTransaction ? 'Редактировать операцию' : `Новый ${getTypeLabel(transactionType).toLowerCase()}`}
            </DialogTitle>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="space-y-2 min-w-0">
              <Label>Тип операции</Label>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { value: 'income', label: 'Приход', color: 'text-emerald-500', activeClass: '' },
                  { value: 'expense', label: 'Расход', color: 'text-red-500', activeClass: '' },
                  { value: 'transfer', label: 'Перевод', color: 'text-blue-500', activeClass: '' },
                  { value: 'exchange', label: 'Обмен', color: 'text-amber-400', activeClass: 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' },
                ].map(opt => {
                  const isActive = transactionType === opt.value;
                  const isTransferLike = (val) => val === 'transfer' || val === 'exchange';
                  return (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={isActive ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => {
                      setTransactionType(opt.value);
                      // Reset category — old category was filtered by previous type
                      setFormData((fd) => {
                        const acc = accounts.find(a => a.id === fd.account_id);
                        return {
                          ...fd,
                          category_id: isTransferLike(opt.value) ? '' : fd.category_id,
                          to_account_id: isTransferLike(opt.value) ? fd.to_account_id : '',
                          // Sync currency to from-account when switching to transfer/exchange
                          currency: isTransferLike(opt.value) && acc ? acc.currency : fd.currency,
                          // Reset cross-currency helpers when leaving transfer-like
                          ...(isTransferLike(opt.value) ? {} : { to_amount: '', manual_rate: '' }),
                          is_exchange: opt.value === 'exchange',
                        };
                      });
                    }}
                    className={isActive ? (opt.activeClass || '') : opt.color}
                    data-testid={`form-type-${opt.value}`}
                  >
                    {opt.label}
                  </Button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label>Дата</Label>
                <Input 
                  type="date" 
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  data-testid="form-date"
                />
              </div>
              <div className="space-y-2 min-w-0">
                <Label>Сумма *</Label>
                <Input 
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  data-testid="form-amount"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2 min-w-0">
                <Label>Валюта{(transactionType === 'transfer' || transactionType === 'exchange') ? ' (со счёта)' : ''}</Label>
                <Select
                  value={formData.currency}
                  onValueChange={(v) => setFormData({ ...formData, currency: v })}
                  disabled={(transactionType === 'transfer' || transactionType === 'exchange')}
                >
                  <SelectTrigger data-testid="form-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PLN">PLN (zł)</SelectItem>
                    <SelectItem value="EUR">EUR (€)</SelectItem>
                    <SelectItem value="USD">USD ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2 min-w-0">
                <Label>Счёт *</Label>
                <Select value={formData.account_id} onValueChange={(v) => {
                  const acc = accounts.find(a => a.id === v);
                  setFormData(prev => ({
                    ...prev,
                    account_id: v,
                    // For transfers source currency must match from-account
                    currency: (transactionType === 'transfer' || transactionType === 'exchange') && acc ? acc.currency : prev.currency,
                    // Reset cross-currency helper fields when source changes
                    ...((transactionType === 'transfer' || transactionType === 'exchange') ? { to_amount: '', manual_rate: '' } : {}),
                  }));
                }}>
                  <SelectTrigger data-testid="form-account">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(a => transactionType !== 'exchange' || !a.is_loan).map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {(transactionType === 'transfer' || transactionType === 'exchange') && (
              <div className="space-y-2 min-w-0">
                <Label>На счёт</Label>
                <Select value={formData.to_account_id} onValueChange={(v) => setFormData({ ...formData, to_account_id: v, to_amount: '', manual_rate: '' })}>
                  <SelectTrigger data-testid="form-to-account">
                    <SelectValue placeholder="Выберите счёт" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.filter(a => a.id !== formData.account_id && (transactionType !== 'exchange' || !a.is_loan)).map(a => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(transactionType === 'transfer' || transactionType === 'exchange') && (() => {
              const fromAcc = accounts.find(a => a.id === formData.account_id);
              const toAcc = accounts.find(a => a.id === formData.to_account_id);
              const fromLoan = fromAcc?.is_loan;
              const toLoan = toAcc?.is_loan;
              const isXCur = toAcc && fromAcc && toAcc.currency !== fromAcc.currency;
              let msg = null;
              if (fromAcc && toAcc && fromLoan && !toLoan) {
                msg = `Получение займа: со счёта «${fromAcc.name}» уйдёт в минус (долг растёт), на «${toAcc.name}» прилетят деньги. Это НЕ доход.`;
              } else if (fromAcc && toAcc && !fromLoan && toLoan) {
                msg = `Погашение займа: «${fromAcc.name}» уменьшится, на «${toAcc.name}» долг сократится. Это НЕ расход.`;
              } else if (isXCur && fromAcc && toAcc) {
                msg = `Обмен валюты: со «${fromAcc.name}» спишется ${fromAcc.currency}, на «${toAcc.name}» прилетит ${toAcc.currency}. Это НЕ доход и НЕ расход.`;
              } else if (fromAcc && toAcc) {
                msg = `Перевод между своими счетами: списание + зачисление. Это НЕ доход и НЕ расход.`;
              }
              if (!msg) return null;
              return (
                <div className="flex items-start gap-2 rounded-md border border-sky-500/30 bg-sky-500/5 p-2.5 text-xs text-sky-200" data-testid="transfer-hint">
                  <Info className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                  <span>{msg}</span>
                </div>
              );
            })()}

            {/* Cross-currency transfer: manual to_amount + exchange rate */}
            {(transactionType === 'transfer' || transactionType === 'exchange') && (() => {
              const fromAcc = accounts.find(a => a.id === formData.account_id);
              const toAcc = accounts.find(a => a.id === formData.to_account_id);
              if (!fromAcc || !toAcc) return null;
              const fromCur = fromAcc.currency;
              const toCur = toAcc.currency;
              if (toCur === fromCur) return null;

              // Convention: rate is always expressed as "1 [foreign] = X PLN" when PLN is involved.
              // Otherwise (e.g. EUR↔USD) fall back to "1 fromCur = X toCur".
              const plnAnchored = fromCur === 'PLN' || toCur === 'PLN';
              const rateNum = plnAnchored ? (fromCur === 'PLN' ? toCur : fromCur) : fromCur;
              const rateDen = plnAnchored ? 'PLN' : toCur;

              // to_amount given rate r (rate = 1 rateNum = r rateDen)
              const computeToAmount = (amt, r) => {
                if (!amt || !r) return '';
                if (plnAnchored) {
                  // fromCur PLN, toCur foreign: to = amt / r  (PLN ÷ rate = foreign)
                  // fromCur foreign, toCur PLN: to = amt * r  (foreign × rate = PLN)
                  return fromCur === 'PLN'
                    ? Number((amt / r).toFixed(2))
                    : Number((amt * r).toFixed(2));
                }
                // direct conversion: rate = toCur per fromCur
                return Number((amt * r).toFixed(2));
              };
              // rate given to_amount
              const computeRate = (amt, ta) => {
                if (!amt || !ta) return '';
                if (plnAnchored) {
                  return fromCur === 'PLN'
                    ? Number((amt / ta).toFixed(6))   // PLN/foreign
                    : Number((ta / amt).toFixed(6)); // PLN/foreign
                }
                return Number((ta / amt).toFixed(6));
              };

              const updateToAmount = (val) => {
                const amt = parseFloat(formData.amount);
                const ta = parseFloat(val);
                const r = computeRate(amt, ta);
                setFormData({ ...formData, to_amount: val, manual_rate: r === '' ? '' : String(r) });
              };
              const updateRate = (val) => {
                const amt = parseFloat(formData.amount);
                const r = parseFloat(val);
                const ta = computeToAmount(amt, r);
                setFormData({ ...formData, manual_rate: val, to_amount: ta === '' ? '' : String(ta) });
              };

              const ratePlaceholder = plnAnchored ? 'например, 4.25' : 'например, 1.08';

              return (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-3" data-testid="xcurrency-block">
                  <p className="text-xs text-amber-300/90 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Перевод между разными валютами ({fromCur} → {toCur}). Укажите фактическую сумму получения или курс банка.
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2 min-w-0">
                      <Label>Сумма к получению ({toCur})</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={formData.to_amount}
                        onChange={(e) => updateToAmount(e.target.value)}
                        placeholder="например, 230.00"
                        data-testid="form-to-amount"
                      />
                    </div>
                    <div className="space-y-2 min-w-0">
                      <Label>Курс (1 {rateNum} = X {rateDen})</Label>
                      <Input
                        type="number"
                        step="0.0001"
                        value={formData.manual_rate}
                        onChange={(e) => updateRate(e.target.value)}
                        placeholder={ratePlaceholder}
                        data-testid="form-manual-rate"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Если оставить поля пустыми — будет применён курс по умолчанию (NBP или ручной из настроек).
                  </p>
                </div>
              );
            })()}

            <div className="space-y-2 min-w-0">
              <Label>Статья</Label>
              <Select value={formData.category_id} onValueChange={(v) => setFormData({ ...formData, category_id: v })}>
                <SelectTrigger data-testid="form-category">
                  <SelectValue placeholder="Выберите статью" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без категории</SelectItem>
                  {filteredCategories.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.group} → {c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label>Направление бизнеса *</Label>
              <Select value={formData.direction_id} onValueChange={(v) => setFormData({ ...formData, direction_id: v })}>
                <SelectTrigger data-testid="form-direction">
                  <SelectValue placeholder="Выберите направление" />
                </SelectTrigger>
                <SelectContent>
                  {directions.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label>Контрагент</Label>
              <Select value={formData.contractor_id} onValueChange={(v) => setFormData({ ...formData, contractor_id: v })}>
                <SelectTrigger data-testid="form-contractor">
                  <SelectValue placeholder="Выберите контрагента" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Без контрагента</SelectItem>
                  {contractors.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 min-w-0">
              <Label>Описание</Label>
              <DescriptionAutocomplete
                value={formData.description}
                onChange={(v) => setFormData({ ...formData, description: v })}
              />
            </div>

            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="is-plan" 
                  checked={formData.status === 'plan'}
                  onCheckedChange={(checked) => setFormData({ ...formData, status: checked ? 'plan' : 'fact' })}
                  data-testid="form-is-plan"
                />
                <Label htmlFor="is-plan" className="text-sm">Плановая операция</Label>
              </div>
            </div>
          </div>

          <DialogFooter className="sticky bottom-0 bg-background border-t border-border pt-3 -mx-6 px-6 -mb-6 pb-4 mt-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSubmit} data-testid="form-submit-btn">
              {editingTransaction ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create rule from transaction */}
      <Dialog open={createRuleOpen} onOpenChange={setCreateRuleOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto" data-testid="create-rule-dialog">
          <DialogHeader>
            <DialogTitle>Создать авто-правило</DialogTitle>
            <DialogDescription>
              Правило автоматически проставит Статью и/или Направление в операциях,
              чьё описание содержит указанный паттерн.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 min-w-0">
            {createRuleData.source_tx && (
              <div className="rounded-md border border-muted bg-muted/30 p-2.5 text-xs min-w-0">
                <p className="text-muted-foreground">Из операции:</p>
                <p className="font-medium truncate">{createRuleData.source_tx.description || '(без описания)'}</p>
              </div>
            )}
            <div className="space-y-2 min-w-0">
              <Label>Паттерн (поиск в описании, без учёта регистра)</Label>
              <Input
                value={createRuleData.pattern}
                onChange={(e) => setCreateRuleData({ ...createRuleData, pattern: e.target.value })}
                placeholder="Например: ALICOR"
                data-testid="rule-pattern-input"
              />
              <p className="text-xs text-muted-foreground break-words">
                Срабатывает, если описание содержит подстроку «{(createRuleData.pattern || '').trim() || '...'}»
              </p>
            </div>
            <div className="space-y-2 min-w-0">
              <Label>Статья</Label>
              <Select
                value={createRuleData.category_id || 'none'}
                onValueChange={(v) => setCreateRuleData({ ...createRuleData, category_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger data-testid="rule-category-select" className="min-w-0">
                  <SelectValue placeholder="Не менять" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не менять</SelectItem>
                  {categories.filter(c => c.is_active !== false).map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 min-w-0">
              <Label>Направление</Label>
              <Select
                value={createRuleData.direction_id || 'none'}
                onValueChange={(v) => setCreateRuleData({ ...createRuleData, direction_id: v === 'none' ? '' : v })}
              >
                <SelectTrigger data-testid="rule-direction-select" className="min-w-0">
                  <SelectValue placeholder="Не менять" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Не менять</SelectItem>
                  {directions.filter(d => d.is_active !== false).map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-start gap-2 cursor-pointer text-sm" htmlFor="apply-existing-cb">
              <input
                type="checkbox"
                id="apply-existing-cb"
                checked={createRuleData.apply_to_existing}
                onChange={(e) => setCreateRuleData({ ...createRuleData, apply_to_existing: e.target.checked })}
                className="mt-1 h-4 w-4 accent-primary"
                data-testid="apply-existing-cb"
              />
              <span className="min-w-0">
                <span className="font-medium">Применить к существующим операциям</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Найдёт все операции с таким описанием и заполнит у них пустые Статью/Направление.
                </span>
              </span>
            </label>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setCreateRuleOpen(false)} disabled={savingRule}>
              Отмена
            </Button>
            <Button onClick={saveRule} disabled={savingRule} data-testid="save-rule-btn">
              {savingRule ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Bot className="h-4 w-4 mr-2" />}
              Создать правило
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptUploadDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        onDone={() => { fetchData(); refreshPendingCount(); }}
      />

      <AnalyzePendingDialog
        open={analyzePendingOpen}
        onOpenChange={setAnalyzePendingOpen}
        onDone={() => { fetchData(); refreshPendingCount(); }}
      />
    </div>
  );
};

export default TransactionsPage;
