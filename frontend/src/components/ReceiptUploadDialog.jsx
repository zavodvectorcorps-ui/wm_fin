import React, { useState, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog';
import { Loader2, Upload, Receipt as ReceiptIcon, CheckCircle2, AlertCircle, Link2 } from 'lucide-react';
import { formatCurrency } from '../lib/utils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const apiClient = () => {
  const token = localStorage.getItem('wm_token');
  return axios.create({
    baseURL: API,
    headers: { Authorization: `Bearer ${token}` },
  });
};

/**
 * ReceiptUploadDialog
 * Props:
 *   open, onOpenChange — standard dialog state
 *   onDone(documentId, transactionId|null) — fired after attach or "leave unmatched"
 */
export const ReceiptUploadDialog = ({ open, onOpenChange, onDone }) => {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null); // { document, extracted, candidates }
  const [linking, setLinking] = useState(false);
  const fileInputRef = useRef(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setUploading(false);
    setLinking(false);
  };
  const close = (val) => {
    if (!val) reset();
    onOpenChange(val);
  };

  const onPick = (f) => {
    if (!f) return;
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    if (!['pdf', 'png', 'jpg', 'jpeg', 'webp', 'heic', 'heif'].includes(ext)) {
      toast.error(`Формат .${ext} не поддерживается`);
      return;
    }
    if (f.size > 12 * 1024 * 1024) {
      toast.error('Файл больше 12 МБ — слишком большой');
      return;
    }
    setFile(f);
  };

  const onUpload = async () => {
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await apiClient().post('/receipts/upload-and-match', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(r.data);
      const c = r.data?.candidates?.length || 0;
      toast.success(c > 0
        ? `AI извлёк данные · найдено ${c} ${c === 1 ? 'кандидата' : 'кандидатов'}`
        : 'AI извлёк данные · совпадений не найдено');
    } catch (e) {
      const raw = e.response?.data?.detail;
      const msg = typeof raw === 'string'
        ? raw
        : Array.isArray(raw) ? raw.map(x => x?.msg || '').join('; ')
        : 'Не удалось загрузить чек';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const onAttach = async (txId) => {
    if (!result?.document?.id || !txId) return;
    setLinking(true);
    try {
      await apiClient().post(`/documents/${result.document.id}/link-transaction?transaction_id=${encodeURIComponent(txId)}`);
      toast.success('Чек привязан к операции');
      onDone && onDone(result.document.id, txId);
      close(false);
    } catch (e) {
      toast.error('Ошибка привязки');
    } finally {
      setLinking(false);
    }
  };

  const onLeaveUnmatched = () => {
    toast.info('Чек сохранён в «Чеки без операций»');
    onDone && onDone(result?.document?.id, null);
    close(false);
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" data-testid="receipt-upload-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ReceiptIcon className="h-5 w-5 text-amber-400" />
            Загрузить чек с AI-распознаванием
          </DialogTitle>
          <DialogDescription>
            Фото или PDF чека → AI достанет дату и сумму → подберёт похожие операции.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: file picker */}
        {!result && (
          <div className="space-y-4 min-w-0">
            <div
              className="border-2 border-dashed border-amber-500/40 rounded-md p-6 text-center cursor-pointer hover:border-amber-500/70 hover:bg-amber-500/5 transition"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); onPick(e.dataTransfer.files?.[0]); }}
              data-testid="receipt-drop-zone"
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-amber-400" />
              {file ? (
                <>
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(file.size / 1024).toFixed(0)} КБ · нажмите «Распознать»
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium">Перетащите чек сюда или кликните</p>
                  <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WEBP, HEIC, PDF · до 12 МБ</p>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif"
                className="hidden"
                onChange={(e) => onPick(e.target.files?.[0])}
                data-testid="receipt-file-input"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => close(false)} disabled={uploading}>Отмена</Button>
              <Button
                onClick={onUpload}
                disabled={!file || uploading}
                className="bg-amber-500 hover:bg-amber-600 text-white"
                data-testid="receipt-recognize-btn"
              >
                {uploading
                  ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Распознаю…</>
                  : 'Распознать'}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* Step 2: extracted data + candidates */}
        {result && (
          <div className="space-y-4 min-w-0">
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm" data-testid="receipt-extracted">
              <p className="font-semibold flex items-center gap-1.5 mb-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                AI извлёк данные:
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Дата:</span> <span className="font-mono font-medium">{result.extracted?.date || '—'}</span></div>
                <div><span className="text-muted-foreground">Сумма:</span> <span className="font-mono font-medium">{result.extracted?.amount != null ? formatCurrency(result.extracted.amount, result.extracted?.currency || 'PLN') : '—'}</span></div>
                <div className="col-span-2"><span className="text-muted-foreground">Магазин:</span> <span className="font-medium">{result.extracted?.merchant || '—'}</span></div>
              </div>
            </div>

            {result.candidates?.length > 0 ? (
              <div>
                <p className="text-sm font-semibold mb-2">Похожие операции (топ {result.candidates.length}):</p>
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {result.candidates.map((tx) => (
                    <div
                      key={tx.id}
                      className="rounded-md border border-muted hover:border-emerald-500/60 hover:bg-emerald-500/5 p-2.5 cursor-pointer transition"
                      onClick={() => !linking && onAttach(tx.id)}
                      data-testid={`receipt-candidate-${tx.id}`}
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
                    Чек сохранён в раздел «Чеки без операций». Вы сможете привязать его вручную позже.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={onLeaveUnmatched} disabled={linking} data-testid="receipt-leave-unmatched-btn">
                Оставить без привязки
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default ReceiptUploadDialog;
