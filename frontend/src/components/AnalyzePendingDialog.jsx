import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import {
  Loader2, ChevronLeft, ChevronRight, Link2, X, ImageIcon, FileText, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { formatCurrency } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const apiClient = () => {
  const token = localStorage.getItem('wm_token');
  return axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });
};

/**
 * AnalyzePendingDialog — wizard to walk through unmatched receipts one by one
 * and link each to a candidate transaction.
 * Props:
 *   open, onOpenChange
 *   onDone — called when wizard finishes / closes
 */
export const AnalyzePendingDialog = ({ open, onOpenChange, onDone }) => {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]); // [{document, candidates}]
  const [idx, setIdx] = useState(0);
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState({ linked: 0, skipped: 0 });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient().get('/receipts/analyze-pending');
      setItems(r.data?.items || []);
      setIdx(0);
      setStats({ linked: 0, skipped: 0 });
    } catch (e) {
      toast.error('Ошибка загрузки чеков');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const current = items[idx];
  const isLastItem = idx >= items.length - 1;

  const advance = () => {
    if (isLastItem) {
      finish();
    } else {
      setIdx(idx + 1);
    }
  };

  const finish = () => {
    const total = stats.linked + stats.skipped;
    toast.success(`Готово: привязано ${stats.linked} из ${total}`);
    onDone && onDone();
    onOpenChange(false);
  };

  const onAttach = async (txId) => {
    if (!current || !txId) return;
    setBusy(true);
    try {
      await apiClient().post(
        `/documents/${current.document.id}/link-transaction?transaction_id=${encodeURIComponent(txId)}`
      );
      setStats((s) => ({ ...s, linked: s.linked + 1 }));
      advance();
    } catch (e) {
      toast.error('Ошибка привязки');
    } finally {
      setBusy(false);
    }
  };

  const onSkip = () => {
    setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
    advance();
  };

  const onDelete = async () => {
    if (!current) return;
    if (!window.confirm('Удалить этот чек безвозвратно?')) return;
    setBusy(true);
    try {
      await apiClient().delete(`/documents/${current.document.id}`);
      setStats((s) => ({ ...s, skipped: s.skipped + 1 }));
      advance();
    } catch {
      toast.error('Ошибка удаления');
    } finally {
      setBusy(false);
    }
  };

  const renderPreview = (doc) => {
    if (!doc) return null;
    const url = `${process.env.REACT_APP_BACKEND_URL}${doc.file_url}`;
    const isPdf = (doc.mime_type || '').includes('pdf');
    if (isPdf) {
      return (
        <div className="relative h-48 rounded-md border border-muted bg-muted/30 overflow-hidden group">
          <embed
            src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            type="application/pdf"
            className="w-full h-full pointer-events-none"
          />
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="absolute inset-0 flex items-end justify-end p-2 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition cursor-zoom-in"
            title="Открыть PDF в новой вкладке"
          >
            <span className="text-xs bg-slate-900/80 text-white px-2 py-1 rounded">PDF · открыть</span>
          </a>
        </div>
      );
    }
    return (
      <a href={url} target="_blank" rel="noreferrer">
        <img
          src={url}
          alt="Чек"
          className="w-full h-48 object-contain rounded-md border border-muted bg-black/20"
          data-testid="receipt-preview-img"
        />
      </a>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onDone && onDone(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="analyze-pending-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-amber-400" />
            Анализ непривязанных чеков
          </DialogTitle>
          <DialogDescription>
            {loading
              ? 'Загружаю…'
              : items.length === 0
              ? 'Все чеки уже привязаны 🎉'
              : `Чек ${idx + 1} из ${items.length} · привязано ${stats.linked} · пропущено ${stats.skipped}`}
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 text-emerald-400 mb-2" />
            <p className="text-sm">Нет чеков, ожидающих привязки.</p>
          </div>
        )}

        {!loading && current && (
          <div className="space-y-4 min-w-0">
            {/* Receipt preview */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>{renderPreview(current.document)}</div>
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm space-y-2" data-testid="receipt-extracted">
                <p className="font-semibold text-amber-300">Распознано AI:</p>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <div><span className="text-muted-foreground">Дата:</span></div>
                  <div className="font-mono font-medium">{current.document.ai_extracted?.date || '—'}</div>
                  <div><span className="text-muted-foreground">Сумма:</span></div>
                  <div className="font-mono font-medium">
                    {current.document.ai_extracted?.amount != null
                      ? formatCurrency(current.document.ai_extracted.amount, current.document.ai_extracted?.currency || 'PLN')
                      : '—'}
                  </div>
                  <div><span className="text-muted-foreground">Магазин:</span></div>
                  <div className="font-medium truncate">{current.document.ai_extracted?.merchant || '—'}</div>
                </div>
                <p className="text-xs text-muted-foreground pt-1 border-t border-amber-500/20">
                  {current.document.file_name}
                </p>
              </div>
            </div>

            {/* Candidates */}
            {current.candidates?.length > 0 ? (
              <div>
                <p className="text-sm font-semibold mb-2">Похожие операции (кликни, чтобы привязать):</p>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {current.candidates.map((tx) => (
                    <div
                      key={tx.id}
                      className={`rounded-md border border-muted hover:border-emerald-500/60 hover:bg-emerald-500/5 p-2.5 transition ${busy ? 'opacity-60 pointer-events-none' : 'cursor-pointer'}`}
                      onClick={() => onAttach(tx.id)}
                      data-testid={`analyze-candidate-${tx.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{tx.description || '(без описания)'}</p>
                          <p className="text-xs text-muted-foreground">
                            {tx.date} · {tx.account_name || '—'}
                            {tx._day_distance > 0 && <span className="ml-1 text-amber-400">· {tx._day_distance} дн.</span>}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className={`text-sm font-mono font-medium ${tx.type === 'expense' ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {tx.type === 'expense' ? '−' : '+'}{formatCurrency(tx.amount, tx.currency)}
                          </p>
                          {tx._amount_delta_pct > 0 && (
                            <p className="text-[10px] text-muted-foreground">Δ {tx._amount_delta_pct}%</p>
                          )}
                        </div>
                        <Link2 className="h-4 w-4 text-emerald-400 flex-shrink-0" />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Подходящих операций не найдено</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Возможно, операция ещё не загружена из выписки. Пропусти — вернёшься позже.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {!loading && items.length > 0 && (
          <DialogFooter className="gap-2 flex-wrap">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0 || busy}
              data-testid="analyze-prev-btn"
            >
              <ChevronLeft className="h-4 w-4 mr-1" /> Назад
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              disabled={busy}
              data-testid="analyze-delete-btn"
            >
              <X className="h-4 w-4 mr-1" /> Удалить чек
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              onClick={onSkip}
              disabled={busy}
              data-testid="analyze-skip-btn"
            >
              Пропустить
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
            <Button onClick={finish} disabled={busy} data-testid="analyze-finish-btn">
              Завершить
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default AnalyzePendingDialog;
