import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { SettingCard } from './SettingCard';
import {
  clearSyncConfig,
  getSyncConfig,
  setSyncConfig,
} from '@/db/sync/config';
import { syncEngine, useSyncStatus } from '@/db/sync/client';

export function SyncSection() {
  const status = useSyncStatus();
  const [{ url, token }, setStored] = useState(() => getSyncConfig());
  const [draftUrl, setDraftUrl] = useState(url ?? '');
  const [draftToken, setDraftToken] = useState(token ?? '');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  useEffect(() => {
    setDraftUrl(url ?? '');
    setDraftToken(token ?? '');
  }, [url, token]);

  const isConfigured = Boolean(url && token);

  const handleConnect = async () => {
    setTesting(true);
    setTestError(null);
    try {
      const trimmedUrl = draftUrl.trim().replace(/\/$/, '');
      const trimmedToken = draftToken.trim();
      if (!trimmedUrl || !trimmedToken) {
        setTestError('Enter both the URL and the token.');
        return;
      }
      // Reachability probe (unauthenticated).
      const health = await fetch(`${trimmedUrl}/api/health`);
      if (!health.ok) {
        setTestError(`Could not reach worker (HTTP ${health.status}).`);
        return;
      }
      // Token probe (authenticated).
      const auth = await fetch(`${trimmedUrl}/api/auth`, {
        headers: { authorization: `Bearer ${trimmedToken}` },
      });
      if (auth.status === 401) {
        setTestError('Token rejected by the worker.');
        return;
      }
      if (!auth.ok) {
        setTestError(`Auth probe failed (HTTP ${auth.status}).`);
        return;
      }
      setSyncConfig({ url: trimmedUrl, token: trimmedToken });
      setStored({ url: trimmedUrl, token: trimmedToken });
      void syncEngine.syncNow().catch(() => undefined);
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = () => {
    if (
      !confirm(
        'Disconnect cloud sync? Your local data stays on this device. To reconnect later, paste the same URL and token.',
      )
    ) {
      return;
    }
    clearSyncConfig();
    setStored({ url: null, token: null });
    setDraftUrl('');
    setDraftToken('');
  };

  return (
    <SettingCard
      title="Cloud sync"
      description="Single-user Cloudflare Worker + D1 backend. Same token on every device."
    >
      {!isConfigured ? (
        <>
          <LabeledInput
            label="Worker URL"
            placeholder="https://calorie-tracker.your-subdomain.workers.dev"
            value={draftUrl}
            onChange={(e) => setDraftUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <LabeledInput
            label="Sync token"
            type="password"
            placeholder="Paste the SYNC_TOKEN you set with wrangler"
            value={draftToken}
            onChange={(e) => setDraftToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          {testError && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {testError}
            </p>
          )}
          <Button
            type="button"
            variant="primary"
            block
            onClick={handleConnect}
            disabled={testing || !draftUrl.trim() || !draftToken.trim()}
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing…
              </>
            ) : (
              <>
                <Cloud className="h-4 w-4" />
                Connect
              </>
            )}
          </Button>
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-2 text-sm">
              <SyncBadge status={status.status} />
              <span className="text-xs text-muted-foreground">
                {status.lastSyncAt
                  ? `Last synced ${formatDistanceToNow(new Date(status.lastSyncAt), { addSuffix: true })}`
                  : 'Not yet synced'}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void syncEngine.syncNow().catch(() => undefined)}
              disabled={status.status === 'syncing'}
              aria-label="Sync now"
            >
              <RefreshCw
                className={status.status === 'syncing' ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
              />
            </Button>
          </div>
          {status.error && (
            <p className="flex items-start gap-1.5 text-xs text-destructive">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {status.error}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            <span className="text-foreground/80">URL:</span> <span className="font-mono">{url}</span>
          </p>
          <Button
            type="button"
            variant="ghost"
            block
            onClick={handleDisconnect}
            className="text-destructive"
          >
            <CloudOff className="h-4 w-4" />
            Disconnect
          </Button>
        </>
      )}
    </SettingCard>
  );
}

function SyncBadge({ status }: { status: 'idle' | 'syncing' | 'ok' | 'error' }) {
  if (status === 'syncing') {
    return (
      <span className="flex items-center gap-1 text-primary">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Syncing
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="flex items-center gap-1 text-destructive">
        <AlertCircle className="h-3.5 w-3.5" />
        Error
      </span>
    );
  }
  if (status === 'ok') {
    return (
      <span className="flex items-center gap-1 text-primary">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Up to date
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 text-muted-foreground">
      <Cloud className="h-3.5 w-3.5" />
      Idle
    </span>
  );
}
