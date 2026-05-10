/**
 * Sync configuration is stored in localStorage so it persists across
 * sessions but never enters Dexie (where it would be subject to the
 * "Wipe local data" button users might use to start fresh, and where
 * a JSON export/import would inadvertently move it between devices).
 */

const URL_KEY = 'calorie-tracker:sync:url';
const TOKEN_KEY = 'calorie-tracker:sync:token';
const CURSOR_KEY = 'calorie-tracker:sync:cursor';
const LAST_SYNC_KEY = 'calorie-tracker:sync:lastSyncAt';

export type Cursors = Partial<Record<string, string>>;

function readLs(key: string): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(key);
}
function writeLs(key: string, value: string | null): void {
  if (typeof localStorage === 'undefined') return;
  if (value === null) localStorage.removeItem(key);
  else localStorage.setItem(key, value);
}

export interface SyncConfig {
  url: string | null;
  token: string | null;
}

export function getSyncConfig(): SyncConfig {
  return {
    url: readLs(URL_KEY),
    token: readLs(TOKEN_KEY),
  };
}

export function setSyncConfig(cfg: SyncConfig): void {
  writeLs(URL_KEY, cfg.url);
  writeLs(TOKEN_KEY, cfg.token);
}

export function clearSyncConfig(): void {
  writeLs(URL_KEY, null);
  writeLs(TOKEN_KEY, null);
  writeLs(CURSOR_KEY, null);
  writeLs(LAST_SYNC_KEY, null);
}

export function getCursors(): Cursors {
  const raw = readLs(CURSOR_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Cursors;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function setCursors(cursors: Cursors): void {
  writeLs(CURSOR_KEY, JSON.stringify(cursors));
}

export function getLastSyncAt(): string | null {
  return readLs(LAST_SYNC_KEY);
}

export function setLastSyncAt(iso: string | null): void {
  writeLs(LAST_SYNC_KEY, iso);
}

export function isConfigured(): boolean {
  const cfg = getSyncConfig();
  return Boolean(cfg.url && cfg.token);
}
