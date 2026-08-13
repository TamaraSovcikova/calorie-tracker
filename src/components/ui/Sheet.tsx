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

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Every open Sheet, innermost last.
 *
 * Escape and the Tab trap are bound to `window`, so with a sheet open inside
 * another sheet BOTH handlers fired: one Escape closed the inner picker and
 * the recipe review underneath it in the same keystroke, losing the review.
 * Only the topmost sheet reacts.
 */
const sheetStack: symbol[] = [];

/**
 * Bottom-sheet on mobile, centred dialog on desktop. Plain Tailwind +
 * portal. Escape / backdrop close, background scroll lock, and a focus
 * trap: focus moves into the sheet on open, Tab cycles within it, and
 * focus is restored to the trigger element on close.
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
    const sheet = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const stackId = Symbol('sheet');
    sheetStack.push(stackId);
    const isTopmost = () => sheetStack[sheetStack.length - 1] === stackId;

    // Move focus into the sheet (first focusable, else the container).
    const focusables = sheet
      ? Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE))
      : [];
    (focusables[0] ?? sheet)?.focus();

    const onKey = (e: KeyboardEvent) => {
      // A sheet under another sheet ignores the keyboard entirely.
      if (!isTopmost()) return;
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !sheet) return;
      // Focus trap: keep Tab cycling within the sheet.
      const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !sheet.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !sheet.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);

    // Lock background scroll.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.removeEventListener('keydown', onKey);
      const at = sheetStack.indexOf(stackId);
      if (at >= 0) sheetStack.splice(at, 1);
      document.body.style.overflow = prevOverflow;
      // Restore focus to whatever triggered the sheet.
      previouslyFocused?.focus?.();
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
        className="absolute inset-0 animate-fade-in bg-foreground/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={ref}
        tabIndex={-1}
        className={cn(
          'relative flex w-full animate-slide-up flex-col bg-card text-card-foreground shadow-2xl outline-none',
          fullScreenMobile
            ? 'h-[92vh] rounded-t-3xl sm:h-auto sm:max-h-[88vh] sm:max-w-md sm:rounded-3xl'
            : 'max-h-[88vh] rounded-t-3xl sm:max-w-md sm:rounded-3xl',
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
