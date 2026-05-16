import { useEffect, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2, Watch } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { SettingCard } from './SettingCard';
import {
  beginFitbitAuth,
  disconnectFitbit,
  getConnectedAccountEmail,
  getFitbitClientId,
  getGoogleClientSecret,
  setFitbitClientId,
  setGoogleClientSecret,
} from '@/lib/fitbit-api';
import { useFitbitTokens } from '@/db/repos/fitbitTokens';
import { format, formatDistanceToNow } from 'date-fns';

export function FitbitSection() {
  const tokens = useFitbitTokens(); // undefined while loading, null when none
  const [draftId, setDraftId] = useState(() => getFitbitClientId() ?? '');
  const [draftSecret, setDraftSecret] = useState(
    () => getGoogleClientSecret() ?? '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track the saved values separately so we can show the "saved" state.
  const [savedId, setSavedId] = useState(() => getFitbitClientId() ?? '');
  const [savedSecret, setSavedSecret] = useState(
    () => getGoogleClientSecret() ?? '',
  );
  useEffect(() => {
    setSavedId(getFitbitClientId() ?? '');
    setSavedSecret(getGoogleClientSecret() ?? '');
  }, []);

  const connected = tokens !== null && tokens !== undefined;
  const isLoading = tokens === undefined;
  const credsReady = Boolean(savedId && savedSecret);

  const handleSaveCreds = () => {
    const id = draftId.trim();
    const secret = draftSecret.trim();
    setFitbitClientId(id || null);
    setGoogleClientSecret(secret || null);
    setSavedId(id);
    setSavedSecret(secret);
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
      title="Fitbit (via Google Health)"
      description="Auto-import daily activity calories into the diary's exercise section. Reads your Fitbit data through the new Google Health API."
    >
      {/* Client ID + Secret — both required (Google web clients are
          confidential clients; the token exchange needs the secret). */}
      <LabeledInput
        label="Google OAuth Client ID"
        placeholder="…apps.googleusercontent.com"
        value={draftId}
        onChange={(e) => setDraftId(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <LabeledInput
        label="Google OAuth Client Secret"
        type="password"
        placeholder={savedSecret ? '•••••••• (saved)' : 'GOCSPX-…'}
        value={draftSecret}
        onChange={(e) => setDraftSecret(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="flex items-center justify-between gap-2">
        <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Google Cloud Credentials
          <ExternalLink className="h-3 w-3" />
        </a>
        <Button
          size="sm"
          variant={
            draftId.trim() !== savedId || draftSecret.trim() !== savedSecret
              ? 'primary'
              : 'secondary'
          }
          onClick={handleSaveCreds}
          disabled={
            draftId.trim() === savedId && draftSecret.trim() === savedSecret
          }
        >
          Save credentials
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
            </div>
            {(() => {
              const email = getConnectedAccountEmail() ?? tokens?.fitbit_user_id;
              return email ? (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">Google account: </span>
                  <span className="font-medium">{email}</span>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  Account unknown — reconnect to record which Google account
                  is linked (we added the email scope).
                </div>
              );
            })()}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
            disabled={busy || !credsReady}
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
        {!credsReady && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Save both your Client ID and Client Secret first.
          </p>
        )}
        {error && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            {error}
          </p>
        )}
      </div>

      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
        <p>
          In Google Cloud Console pick <span className="font-medium">Web application</span>{' '}
          OAuth client + add this redirect URI:
        </p>
        <p className="font-mono break-all text-foreground/80">
          {typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}
          /auth/fitbit/callback
        </p>
        <p>
          <span className="font-medium text-amber-700 dark:text-amber-300">
            Heads-up:
          </span>{' '}
          Google issues 7-day refresh tokens to apps in "Testing" mode (which
          is normal for personal use, avoids needing app verification).
          About once a week you'll see a "Reconnect Fitbit" button — one tap to
          re-authorise. Connecting on one device propagates to every device
          via cloud sync.
        </p>
      </div>
    </SettingCard>
  );
}
