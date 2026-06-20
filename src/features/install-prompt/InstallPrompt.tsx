import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

const DISMISS_KEY = 'calorie-tracker:install-dismissed:v1';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  // iOS Safari uses navigator.standalone
  return (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

function isIosSafari(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIos && isSafari;
}

/**
 * "Add to home screen" affordance.
 *
 * On Android Chrome / Edge / Samsung browsers we hook beforeinstallprompt
 * and show a native-looking banner with an Install button. On iOS Safari
 * (which doesn't fire beforeinstallprompt) we show a static how-to since
 * it's the only path to PWA install.
 *
 * Either banner sets a localStorage dismissal flag so we don't nag.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIos, setShowIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    if (typeof localStorage !== 'undefined' && localStorage.getItem(DISMISS_KEY)) {
      return;
    }
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    if (isIosSafari()) {
      // wait a beat so it doesn't appear immediately on first paint
      const t = setTimeout(() => setShowIos(true), 4000);
      return () => {
        window.removeEventListener('beforeinstallprompt', handler);
        clearTimeout(t);
      };
    }
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const dismiss = () => {
    setDeferred(null);
    setShowIos(false);
    localStorage.setItem(DISMISS_KEY, '1');
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    if (outcome === 'accepted') {
      setDeferred(null);
    } else {
      dismiss();
    }
  };

  if (!deferred && !showIos) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[150] flex justify-center px-4 sm:bottom-6">
      <div className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-lg">
        <div className="rounded-full bg-primary/10 p-2">
          <Download className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1 text-sm">
          {deferred ? (
            <>
              <div className="font-medium">Install Verve</div>
              <div className="text-xs text-muted-foreground">
                Faster opens, works offline.
              </div>
            </>
          ) : (
            <>
              <div className="font-medium">Add to Home Screen</div>
              <div className="text-xs text-muted-foreground">
                Tap Share → "Add to Home Screen" in Safari.
              </div>
            </>
          )}
        </div>
        {deferred && (
          <Button size="sm" variant="primary" onClick={install}>
            Install
          </Button>
        )}
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss"
          className="tap-target rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
