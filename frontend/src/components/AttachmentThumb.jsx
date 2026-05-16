import React, { useState } from 'react';
import axios from 'axios';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';
import { Paperclip, FileText, Loader2, ExternalLink, Unlink, Maximize2 } from 'lucide-react';
import { toast } from 'sonner';
import { Lightbox } from './Lightbox';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const apiClient = () => {
  const token = localStorage.getItem('wm_token');
  return axios.create({ baseURL: API, headers: { Authorization: `Bearer ${token}` } });
};

/**
 * AttachmentThumb — small paperclip icon that, on click, shows a popover
 * with thumbnails of all attached receipts for a transaction.
 * Props:
 *   transactionId
 *   onUnlinked — callback after a successful unlink (so parent can refresh)
 */
export const AttachmentThumb = ({ transactionId, onUnlinked }) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [docs, setDocs] = useState([]);
  const [lightbox, setLightbox] = useState(null); // { url, mimeType, fileName }

  const load = async () => {
    setLoading(true);
    try {
      const r = await apiClient().get(`/transactions/${transactionId}/documents`);
      setDocs(Array.isArray(r.data) ? r.data : []);
    } catch {
      setDocs([]);
    } finally {
      setLoading(false);
    }
  };

  const onOpenChange = (v) => {
    setOpen(v);
    if (v) load();
  };

  const onUnlink = async (docId, e) => {
    e.stopPropagation();
    if (!window.confirm('Открепить чек от операции? Файл останется в системе и попадёт в «непривязанные».')) return;
    try {
      await apiClient().delete(`/documents/${docId}/unlink`);
      toast.success('Чек откреплён');
      setDocs((arr) => arr.filter((d) => d.id !== docId));
      onUnlinked && onUnlinked();
      // close if nothing left
      setTimeout(() => {
        setDocs((arr) => {
          if (arr.length === 0) setOpen(false);
          return arr;
        });
      }, 50);
    } catch {
      toast.error('Не удалось открепить');
    }
  };

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className="text-amber-400 hover:text-amber-300 transition-colors"
          title="Посмотреть прикреплённый чек"
          data-testid={`paperclip-${transactionId}`}
        >
          <Paperclip className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 p-3 bg-slate-900 border-amber-500/30"
        onClick={(e) => e.stopPropagation()}
        data-testid={`attachment-popover-${transactionId}`}
      >
        {loading && (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loading && docs.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">Чеков нет</p>
        )}
        {!loading && docs.length > 0 && (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {docs.map((doc) => {
              const url = `${process.env.REACT_APP_BACKEND_URL}${doc.file_url}`;
              const isPdf = (doc.mime_type || '').includes('pdf');
              const openLightbox = (e) => {
                e.preventDefault();
                e.stopPropagation();
                setLightbox({ url, mimeType: doc.mime_type, fileName: doc.file_name });
              };
              return (
                <div key={doc.id} className="space-y-1.5">
                  {isPdf ? (
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
                  ) : (
                    <div
                      className="relative cursor-zoom-in group"
                      onDoubleClick={openLightbox}
                      title="Двойной клик — на весь экран"
                    >
                      <img
                        src={url}
                        alt={doc.file_name}
                        className="w-full h-40 object-contain rounded-md border border-muted bg-black/20 group-hover:opacity-90 transition"
                      />
                      <button
                        type="button"
                        onClick={openLightbox}
                        className="absolute top-1.5 right-1.5 p-1 rounded bg-slate-900/70 text-white opacity-0 group-hover:opacity-100 transition"
                        title="Открыть на весь экран"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-muted-foreground" title={doc.file_name}>{doc.file_name}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sky-400 hover:text-sky-300"
                        title="Открыть в новой вкладке"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={(e) => onUnlink(doc.id, e)}
                        className="text-rose-400 hover:text-rose-300"
                        title="Открепить от операции"
                        data-testid={`unlink-doc-${doc.id}`}
                      >
                        <Unlink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </PopoverContent>
      <Lightbox
        open={!!lightbox}
        onOpenChange={(v) => { if (!v) setLightbox(null); }}
        url={lightbox?.url}
        mimeType={lightbox?.mimeType}
        fileName={lightbox?.fileName}
      />
    </Popover>
  );
};

export default AttachmentThumb;
