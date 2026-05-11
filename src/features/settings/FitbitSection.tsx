import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2, Watch } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { SettingCard } from './SettingCard';
import {
  beginFitbitAuth,
  disconnectFitbit,
  getFitbitClientId,
  setFitbitClientId,
} from '@/lib/fitbit-api';
import { useFitbitTokens } from '@/db/repos/fitbitTokens';
import { format, formatDistanceToNow } from 'date-fns';

export function FitbitSection() {
  const tokens = useFitbitTokens(); // undefined while loading, null when none
  const [draftId, setDraftId] = useState(() => getFitbitClientId() ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the saved client ID separately so we can show the "saved" pill.
  const [savedId, setSavedId] = useState(() => getFitbitClientId() ?? '');
  useEffect(() => setSavedId(getFitbitClientId() ?? ''), []);

  const connected = tokens !== null && tokens !== undefined;
  const isLoading = tokens === undefined;

  const handleSaveId = () => {
    const next = draftId.trim();
    setFitbitClientId(next || null);
    setSavedId(next);
  };

  const handleConnect = async () => {
    setError(null);
    setBusy(true);
    try {
      const url = await beginFitbitAuth();
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start auth');
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Fitbit? Re-authorise any time.')) return;
    await disconnectFitbit();
  };

  const expiresAt = tokens ? new Date(tokens.expires_at) : null;
  const isExpired = expiresAt ? expiresAt.getTime() < Date.now() : false;

  return (
    <SettingCard
      title="Fitbit"
      description="Auto-import daily activity calories into the diary's exercise section."
    >
      {/* Client ID input — required for OAuth to work */}
      <LabeledInput
        label="Fitbit OAuth Client ID"
        placeholder="e.g. 23ABCD"
        value={draftId}
        onChange={(e) => setDraftId(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="flex items-center justify-between gap-2">
        <a
          href="https://dev.fitbit.com/apps/new"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Register an app
          <ExternalLink className="h-3 w-3" />
        </a>
        <Button
          size="sm"
          variant={draftId.trim() !== savedId ? 'primary' : 'secondary'}
          onClick={handleSaveId}
          disabled={draftId.trim() === savedId}
        >
          Save Client ID
        </Button>
      </div>

      <div className="border-t border-border pt-3">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Watch className="h-4 w-4 text-primary" />
              <span className="font-medium">Connected</span>
              {isExpired ? (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  Token expired — will refresh on next fetch
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Token valid until{' '}
                  {expiresAt && format(expiresAt, 'd MMM, HH:mm')} ·{' '}
                  {expiresAt && formatDistanceToNow(expiresAt, { addSuffix: true })}
                </span>
              )}
            </div>
            <Button
              type="button"
              variant="ghost"
              block
              onClick={handleDisconnect}
              className="text-destructive"
            >
              Disconnect Fitbit
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            variant="primary"
            block
            onClick={handleConnect}
            disabled={busy || !savedId}
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Redirecting…
              </>
            ) : (
              <>
                <Watch className="h-4 w-4" />
                Connect Fitbit
              </>
            )}
          </Button>
        )}
        {!savedId && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Save your Fitbit Client ID first.
          </p>
        )}
        {error && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        On dev.fitbit.com choose <span className="font-medium">Client</span>{' '}
        type + redirect URL{' '}
        <span className="font-mono">
          {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}
          /auth/fitbit/callback
        </span>
        . Connecting on one device works on every device via cloud sync.
      </p>
    </SettingCard>
  );
}
