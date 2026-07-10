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
  { to: '/diary', label: 'Today', icon: BookOpen },
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
          Offline - changes save here and sync when you reconnect
        </div>
      )}
      {online && sync.status === 'error' && (
        <button
          type="button"
          onClick={() => navigate('/settings')}
          className="flex w-full items-center justify-center gap-1.5 bg-destructive/90 px-3 py-1.5 text-xs font-medium text-destructive-foreground"
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Cloud sync failed - tap to check Settings
        </button>
      )}
      <main className="flex-1 overflow-y-auto pb-20">
        <Outlet />
      </main>
      <nav
        style={{ borderTopColor: 'var(--color-border)', background: 'var(--color-bg)' }}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50',
          'border-t backdrop-blur-sm',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="mx-auto flex h-16 max-w-md items-center justify-around px-[30px]">
          {NAV_ITEMS.map(({ to, icon: Icon }) => (
            <li key={to}>
              <NavLink to={to}>
                {({ isActive }) => (
                  <div className="relative flex items-center justify-center p-2">
                    <Icon
                      className="h-[21px] w-[21px]"
                      strokeWidth={isActive ? 2 : 1.6}
                      style={{ color: isActive ? 'var(--color-accent-deep)' : 'var(--color-text-faint)' }}
                    />
                    {isActive && (
                      <span
                        className="absolute rounded-full"
                        style={{
                          width: 4,
                          height: 4,
                          background: 'var(--color-accent-deep)',
                          bottom: -2,
                          left: '50%',
                          transform: 'translateX(-50%)',
                        }}
                      />
                    )}
                  </div>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
