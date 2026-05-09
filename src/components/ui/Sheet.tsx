import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { cn } from '@/lib/cn';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
  /** When true, sheet fills the entire viewport on mobile (good for forms). */
  fullScreenMobile?: boolean;
}

/**
 * Bottom-sheet on mobile, centred dialog on desktop. Plain Tailwind + portal.
 * No focus trap library — we render at document.body and rely on the close
 * button + escape key. Good enough for v1.
 */
export function Sheet({
  open,
  onClose,
  title,
  trailing,
  children,
  className,
  fullScreenMobile = true,
}: SheetProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Lock background scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={ref}
        className={cn(
          'relative flex w-full flex-col bg-card text-card-foreground shadow-2xl',
          fullScreenMobile
            ? 'h-[92vh] rounded-t-2xl sm:h-auto sm:max-h-[88vh] sm:max-w-md sm:rounded-2xl'
            : 'max-h-[88vh] rounded-t-2xl sm:max-w-md sm:rounded-2xl',
          className,
        )}
      >
        {(title || trailing) && (
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="min-w-0 flex-1 truncate text-base font-semibold">{title}</div>
            <div className="flex shrink-0 items-center gap-1">
              {trailing}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="tap-target rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </header>
        )}
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
