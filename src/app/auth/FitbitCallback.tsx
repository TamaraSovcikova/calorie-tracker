import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { completeFitbitAuth } from '@/lib/fitbit-api';

/**
 * Lives at /auth/fitbit/callback — Fitbit redirects here with ?code&state
 * after the user authorises. Exchanges the code for tokens (PKCE in the
 * browser, no server secret), stores them in Dexie (which syncs to the
 * worker), then bounces back to Settings.
 */
export function FitbitCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'exchanging' | 'ok' | 'error'>(
    'exchanging',
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await completeFitbitAuth(params);
        if (cancelled) return;
        setStatus('ok');
        setTimeout(() => navigate('/settings', { replace: true }), 900);
      } catch (err) {
        if (cancelled) return;
        setStatus('error');
        setError(err instanceof Error ? err.message : 'Unknown error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [params, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        {status === 'exchanging' && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
            <h1 className="mt-4 text-base font-semibold">Connecting Fitbit…</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Exchanging authorisation code.
            </p>
          </>
        )}
        {status === 'ok' && (
          <>
            <CheckCircle2 className="mx-auto h-8 w-8 text-primary" />
            <h1 className="mt-4 text-base font-semibold">Fitbit connected</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Heading back to Settings…
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle className="mx-auto h-8 w-8 text-destructive" />
            <h1 className="mt-4 text-base font-semibold">Couldn't connect</h1>
            <p className="mt-1 text-sm text-destructive">{error}</p>
            <Button
              className="mt-4"
              onClick={() => navigate('/settings', { replace: true })}
            >
              Back to Settings
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
