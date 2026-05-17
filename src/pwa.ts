import { registerSW } from 'virtual:pwa-register';
import { toast } from '@/components/ui/toast';

/**
 * Register the service worker. On a new deploy the worker surfaces an
 * in-app "Reload" toast (prompt mode) rather than reloading silently.
 */
export function registerPwa(): void {
  const updateSW = registerSW({
    onNeedRefresh() {
      toast({
        message: 'A new version of the app is available.',
        action: { label: 'Reload', onClick: () => void updateSW(true) },
        duration: 0,
      });
    },
  });
}

/**
 * Ask the browser to make local storage persistent so IndexedDB (the
 * diary, meals, weight log) can't be evicted under storage pressure.
 * Best-effort — installed PWAs are almost always granted this.
 */
export async function requestPersistentStorage(): Promise<void> {
  if (!navigator.storage?.persist) return;
  try {
    if (await navigator.storage.persisted()) return;
    await navigator.storage.persist();
  } catch {
    /* best-effort — nothing to do if the browser refuses */
  }
}
