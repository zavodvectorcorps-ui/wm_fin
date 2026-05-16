import React from 'react';
import { Dialog, DialogContent } from './ui/dialog';
import { X, ExternalLink, FileText } from 'lucide-react';

/**
 * Lightbox — full-screen preview for receipt files (image or PDF).
 * Props:
 *   open, onOpenChange
 *   url       — absolute URL of the file
 *   mimeType  — MIME type to decide rendering mode
 *   fileName  — for display + download
 */
export const Lightbox = ({ open, onOpenChange, url, mimeType, fileName }) => {
  if (!url) return null;
  const isPdf = (mimeType || '').includes('pdf');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-[95vw] w-[95vw] max-h-[95vh] h-[95vh] p-0 bg-slate-950 border-amber-500/30 overflow-hidden flex flex-col"
        data-testid="lightbox-modal"
      >
        {/* Top toolbar */}
        <div className="flex items-center justify-between gap-2 px-4 py-2 bg-slate-900/60 border-b border-slate-800 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            {isPdf
              ? <FileText className="h-4 w-4 text-amber-400 flex-shrink-0" />
              : <span className="text-amber-400 text-base flex-shrink-0">🖼</span>}
            <span className="text-sm truncate" title={fileName}>{fileName || 'preview'}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1"
              title="Открыть в новой вкладке / скачать"
            >
              <ExternalLink className="h-3.5 w-3.5" /> Открыть
            </a>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="text-muted-foreground hover:text-foreground"
              title="Закрыть (Esc)"
              data-testid="lightbox-close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 bg-black/60 flex items-center justify-center overflow-auto">
          {isPdf ? (
            <embed
              src={`${url}#toolbar=1&navpanes=0&view=FitH`}
              type="application/pdf"
              className="w-full h-full"
            />
          ) : (
            <img
              src={url}
              alt={fileName || 'receipt'}
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default Lightbox;
