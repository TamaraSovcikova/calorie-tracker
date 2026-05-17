import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BookOpen,
  CloudOff,
  Library,
  LineChart,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useSyncStatus } from '@/db/sync/client';

/** Tracks the browser's online/offline state. */
function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

const NAV_ITEMS = [
  { to: '/diary', label: 'Diary', icon: BookOpen },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Layout() {
  const sync = useSyncStatus();
  const online = useOnline();
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col bg-background">
      {!online && (
        <div className="flex w-full items-center justify-center gap-1.5 bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          <CloudOff className="h-3.5 w-3.5" />
          Offline — changes save here and sync when you reconnect
        </div>
      )}
      {online && sync.status === 'error' && (
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex w-full items-center justify-center gap-1.5 bg-destructive/90 px-3 py-1.5 text-xs font-medium text-destructive-foreground"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Cloud sync failed — tap to check Settings
        </button>
      )}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <nav
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'border-t border-border bg-background/95 backdrop-blur',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="mx-auto flex max-w-md items-stretch justify-around">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <li key={to} className="flex-1">
              <NavLink
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex flex-col items-center justify-center gap-1 py-2 text-[11px] tap-target',
                    isActive
                      ? 'text-primary'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex h-7 w-14 items-center justify-center rounded-full transition-colors',
                        isActive && 'bg-accent',
                      )}
                    >
                      <Icon className="h-5 w-5" strokeWidth={2.25} />
                    </span>
                    <span className={cn(isActive && 'font-medium')}>{label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
