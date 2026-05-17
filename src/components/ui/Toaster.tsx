import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import { useToastStore } from './toast';

/**
 * Bottom-anchored toast stack. Sits above the bottom nav on mobile and is
 * portalled to the body so no parent overflow can clip it.
 */
export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  if (toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[160] flex flex-col items-center gap-2 px-4 sm:bottom-8">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex w-full max-w-md animate-slide-up items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg"
        >
          {t.variant === 'success' && (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
          )}
          {t.variant === 'error' && (
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
          )}
          <div className="min-w-0 flex-1 text-sm">{t.message}</div>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.onClick();
                dismiss(t.id);
              }}
              className="shrink-0 text-sm font-semibold text-primary hover:underline"
            >
              {t.action.label}
            </button>
          )}
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
            className="tap-target shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
