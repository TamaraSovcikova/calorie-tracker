import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Copy,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { SettingCard } from './SettingCard';
import {
  clearSyncConfig,
  getSyncConfig,
  setSyncConfig,
  syncBaseUrl,
} from '@/db/sync/config';
import { adoptSyncCode } from '@/db/sync/userMigration';
import { syncEngine, useSyncStatus } from '@/db/sync/client';

/** Generate a fresh, human-friendly sync code: 20 chars of ambiguity-free
 *  base32 (~100 bits), grouped for readability. The code IS the account. */
function generateCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I/O/0/1
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return [...bytes]
    .map((b) => alphabet[b % 32])
    .join('')
    .replace(/(.{5})(?=.)/g, '$1-');
}

export function SyncSection() {
  const status = useSyncStatus();
  const [{ token }, setStored] = useState(() => getSyncConfig());
  const [draftCode, setDraftCode] = useState(token ?? '');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setDraftCode(token ?? '');
  }, [token]);

  const isConfigured = Boolean(token);

  const handleConnect = async () => {
    setTesting(true);
    setTestError(null);
    try {
      const code = draftCode.trim();
      if (code.length < 12) {
        setTestError('Enter a sync code (at least 12 characters).');
        return;
      }
      const base = syncBaseUrl();
      // Reachability probe (unauthenticated).
      const health = await fetch(`${base}/api/health`);
      if (!health.ok) {
        setTestError(`Could not reach the sync server (HTTP ${health.status}).`);
        return;
      }
      // Code probe (authenticated).
      const auth = await fetch(`${base}/api/auth`, {
        headers: { authorization: `Bearer ${code}` },
      });
      if (!auth.ok) {
        setTestError(`Sync server rejected the code (HTTP ${auth.status}).`);
        return;
      }
      setSyncConfig({ token: code });
      // Migrate this device's data to the account derived from the code,
      // then reload so every screen picks up the new account id.
      await adoptSyncCode(code);
      setStored({ token: code });
      window.location.reload();
    } catch {
      setTestError('Could not reach the sync server. Check your connection.');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = () => {
    if (
      !confirm(
        'Disconnect cloud sync? Your data stays on this device. Reconnect any time with the same code.',
      )
    ) {
      return;
    }
    clearSyncConfig();
    setStored({ token: null });
    setDraftCode('');
  };

  const handleCopy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable - ignore */
    }
  };

  return (
    <SettingCard
      title="Cloud sync"
      description="Your sync code is your private account. Enter the same code on every device to keep them in sync - and never share it."
    >
      {!isConfigured ? (
        <>
          <LabeledInput
            label="Sync code"
            placeholder="Enter an existing code, or generate one"
            value={draftCode}
            onChange={(e) => setDraftCode(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDraftCode(generateCode())}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate a new code
          </Button>
          <p className="text-xs text-muted-foreground">
            New here? Generate a code - that&apos;s your account. Already set up
            on another device? Enter that device&apos;s code instead.
          </p>
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
            disabled={testing || draftCode.trim().length < 12}
          >
            {testing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Connecting…
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
          <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Your sync code</span>
              <Button size="sm" variant="ghost" onClick={() => void handleCopy()}>
                {copied ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="break-all font-mono text-xs text-foreground/90">{token}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Enter this on your other devices. Anyone with it can see your
              data - keep it private.
            </p>
          </div>
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
