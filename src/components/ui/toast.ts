import { create } from 'zustand';

export type ToastVariant = 'default' | 'success' | 'error';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

export interface ShowToastOptions {
  message: string;
  variant?: ToastVariant;
  action?: ToastAction;
  /** Auto-dismiss after this many ms; 0 keeps it until dismissed. */
  duration?: number;
}

interface ToastState {
  toasts: Toast[];
  show: (opts: ShowToastOptions) => void;
  dismiss: (id: number) => void;
}

let nextId = 1;

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  show: ({ message, variant = 'default', action, duration }) => {
    const id = nextId++;
    // Undo-style toasts linger longer so the action stays reachable.
    const ttl = duration ?? (action ? 6000 : 3500);
    set((s) => ({ toasts: [...s.toasts, { id, message, variant, action }] }));
    if (ttl > 0) setTimeout(() => get().dismiss(id), ttl);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** Fire a toast from anywhere - no component subscription needed. */
export function toast(opts: ShowToastOptions | string): void {
  useToastStore.getState().show(typeof opts === 'string' ? { message: opts } : opts);
}
