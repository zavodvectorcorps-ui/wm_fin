import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import {
  Loader2, ChevronLeft, ChevronRight, Link2, X, ImageIcon, FileText, CheckCircle2, AlertCircle, Maximize2, Plus,
} from 'lucide-react';
import { formatCurrency } from '../lib/utils';
import { Lightbox } from './Lightbox';

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
  const [stats, setStats] = useState({ linked: 0, skipped: 0, created: 0 });
  const [lightbox, setLightbox] = useState(null);
  const [creating, setCreating] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [form, setForm] = useState({ type: 'expense', account_id: '', category_id: '', contractor_id: '', description: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiClient().get('/receipts/analyze-pending');
      setItems(r.data?.items || []);
      setIdx(0);
      setStats({ linked: 0, skipped: 0, created: 0 });
      // Load reference data once for the create-form
      const [accs, cats, conts] = await Promise.all([
        apiClient().get('/accounts').catch(() => ({ data: [] })),
        apiClient().get('/categories').catch(() => ({ data: [] })),
        apiClient().get('/contractors').catch(() => ({ data: [] })),
      ]);
      setAccounts((accs.data || []).filter(a => a.is_active && !a.is_loan));
      setCategories(cats.data || []);
      setContractors(conts.data || []);
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

  // Pre-fill the create-form whenever the current receipt changes
  useEffect(() => {
    if (!current) return;
    const ext = current.document?.ai_extracted || {};
    // Fuzzy-match contractor by merchant name (case-insensitive, both directions).
    let suggestedContractorId = '';
    if (ext.merchant && contractors.length) {
      const m = ext.merchant.toLowerCase().trim();
      const hit = contractors.find((c) => {
        const n = (c.name || '').toLowerCase().trim();
        return n && (n === m || n.includes(m) || m.includes(n));
      });
      if (hit) suggestedContractorId = hit.id;
    }
    setForm({
      type: 'expense',
      account_id: '',
      category_id: '',
      contractor_id: suggestedContractorId,
      description: ext.merchant || current.document?.description || '',
    });
    setCreating(false);
  }, [idx, current?.document?.id, contractors]);

  const advance = () => {
    if (isLastItem) {
      finish();
    } else {
      setIdx(idx + 1);
    }
  };

  const finish = () => {
    const total = stats.linked + stats.skipped + stats.created;
    toast.success(`Готово: привязано ${stats.linked}, создано ${stats.created} из ${total}`);
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

  const onCreate = async () => {
    if (!current) return;
    if (!form.account_id) {
      toast.error('Выберите счёт');
      return;
    }
    setBusy(true);
    try {
      await apiClient().post(`/receipts/${current.document.id}/create-transaction`, {
        type: form.type,
        account_id: form.account_id,
        category_id: form.category_id || null,
        contractor_id: form.contractor_id || null,
        description: form.description || null,
      });
      setStats((s) => ({ ...s, created: s.created + 1 }));
      toast.success('Операция создана и привязана');
      advance();
    } catch (e) {
      toast.error(e?.response?.data?.detail || 'Ошибка создания операции');
    } finally {
      setBusy(false);
    }
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
    const openLightbox = (e) => {
      e.preventDefault();
      e.stopPropagation();
      setLightbox({ url, mimeType: doc.mime_type, fileName: doc.file_name });
    };
    if (isPdf) {
      return (
        <div
          className="relative h-48 rounded-md border border-muted bg-muted/30 overflow-hidden group cursor-zoom-in"
          onDoubleClick={openLightbox}
          title="Двойной клик — на весь экран"
        >
          <embed
            src={`${url}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
            type="application/pdf"
            className="w-full h-full pointer-events-none"
          />
          <button
            type="button"
            onClick={openLightbox}
            className="absolute inset-0 flex items-end justify-end p-2 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition"
            title="Открыть на весь экран"
          >
            <span className="text-xs bg-slate-900/80 text-white px-2 py-1 rounded flex items-center gap-1">
              <Maximize2 className="h-3 w-3" /> На весь экран
            </span>
          </button>
        </div>
      );
    }
    return (
      <div
        className="relative cursor-zoom-in group"
        onDoubleClick={openLightbox}
        title="Двойной клик — на весь экран"
      >
        <img
          src={url}
          alt="Чек"
          className="w-full h-48 object-contain rounded-md border border-muted bg-black/20 group-hover:opacity-90 transition"
          data-testid="receipt-preview-img"
        />
        <button
          type="button"
          onClick={openLightbox}
          className="absolute top-2 right-2 p-1 rounded bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition"
          title="Открыть на весь экран"
        >
          <Maximize2 className="h-4 w-4" />
        </button>
      </div>
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
              : `Чек ${idx + 1} из ${items.length} · привязано ${stats.linked} · создано ${stats.created} · пропущено ${stats.skipped}`}
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
              <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3 text-sm flex items-start gap-2" data-testid="no-candidates-block">
                <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-medium">Подходящих операций не найдено</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Можно создать новую операцию прямо отсюда — данные из чека подставятся автоматически.
                  </p>
                </div>
              </div>
            )}

            {/* Inline quick-create form: shown when no candidates, or when user clicks "Создать новую" */}
            {(current.candidates?.length === 0 || creating) && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 space-y-2.5" data-testid="quick-create-form">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Plus className="h-4 w-4" /> Создать новую операцию из чека
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Тип</Label>
                    <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="quick-create-type"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="expense">Расход</SelectItem>
                        <SelectItem value="income">Доход</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Счёт *</Label>
                    <Select value={form.account_id} onValueChange={(v) => setForm(f => ({ ...f, account_id: v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="quick-create-account"><SelectValue placeholder="Выбери счёт" /></SelectTrigger>
                      <SelectContent>
                        {accounts.map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.name} <span className="text-[10px] text-muted-foreground">({a.currency})</span></SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Категория</Label>
                    <Select value={form.category_id} onValueChange={(v) => setForm(f => ({ ...f, category_id: v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="quick-create-category"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {categories.filter(c => !c.type || c.type === form.type).map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px] flex items-center gap-1">
                      Контрагент
                      {form.contractor_id && current.document?.ai_extracted?.merchant && (
                        <span className="text-[9px] text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">авто</span>
                      )}
                    </Label>
                    <Select value={form.contractor_id} onValueChange={(v) => setForm(f => ({ ...f, contractor_id: v }))}>
                      <SelectTrigger className="h-8 text-xs" data-testid="quick-create-contractor"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {contractors.map(c => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 col-span-2">
                    <Label className="text-[11px]">Описание</Label>
                    <Input
                      value={form.description}
                      onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                      className="h-8 text-xs"
                      data-testid="quick-create-description"
                    />
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Дата ({current.document.ai_extracted?.date || '—'}) и сумма ({current.document.ai_extracted?.amount != null ? formatCurrency(current.document.ai_extracted.amount, current.document.ai_extracted?.currency || 'PLN') : '—'}) возьмутся из распознанного чека.
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={onCreate}
                  disabled={busy || !form.account_id}
                  data-testid="quick-create-submit"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Plus className="h-4 w-4 mr-1" />}
                  Создать и привязать
                </Button>
              </div>
            )}

            {/* Show "Создать новую" link when there ARE candidates but user wants to bypass them */}
            {current.candidates?.length > 0 && !creating && (
              <button
                type="button"
                className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2"
                onClick={() => setCreating(true)}
                data-testid="show-quick-create-btn"
              >
                + Ни одна не подходит — создать новую операцию
              </button>
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
      <Lightbox
        open={!!lightbox}
        onOpenChange={(v) => { if (!v) setLightbox(null); }}
        url={lightbox?.url}
        mimeType={lightbox?.mimeType}
        fileName={lightbox?.fileName}
      />
    </Dialog>
  );
};

export default AnalyzePendingDialog;
