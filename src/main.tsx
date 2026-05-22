import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { db } from './db/dexie';
import { ensureSeed } from './db/seed';
import { isConfigured } from './db/sync/config';
import { syncEngine } from './db/sync/client';
import { installSync } from './db/sync/install';
import { resolveUserId } from './db/sync/userMigration';
import { currentUserId } from './db/userId';
import { runWellbeingRollForward } from './features/pet/wellbeingRollForward';
import { registerPwa, requestPersistentStorage } from './pwa';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Boot order matters for per-user isolation:
 *   1. resolveUserId() — if a sync code is configured, migrate this
 *      device's 'local' rows onto the derived account id.
 *   2. On a device that has no profile yet but DOES have a code, pull the
 *      account's data first so we don't seed (and then push) a blank
 *      profile over the real one.
 *   3. ensureSeed() — creates defaults only for whatever is still missing.
 */
async function boot(): Promise<void> {
  try {
    await resolveUserId();
  } catch (err) {
    console.error('User-id resolve failed', err);
  }

  try {
    const hasProfile = Boolean(await db.profiles.get(currentUserId()));
    if (!hasProfile && isConfigured()) {
      // First run on a fresh device with a code — block once on the
      // initial pull so seeding sees the real account data.
      await syncEngine.syncNow().catch(() => undefined);
    }
  } catch (err) {
    console.error('Initial sync probe failed', err);
  }

  ensureSeed()
    .then(() => {
      installSync();
      void runWellbeingRollForward().catch(() => undefined);
    })
    .catch((err) => {
      console.error('Seed/profile init failed', err);
      installSync();
    });

  registerPwa();
  void requestPersistentStorage();

  // Dev-only: expose `window.__dog` pose helpers for testing the pet's
  // states. Dynamic import + DEV guard keeps it out of production bundles.
  if (import.meta.env.DEV) {
    void import('./features/pet/devPose').then((m) => m.installDogDevConsole());
  }

  const rootElement = document.getElementById('root');
  if (!rootElement) throw new Error('Root element not found');

  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </QueryClientProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}

void boot();
