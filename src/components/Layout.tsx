import { NavLink, Outlet } from 'react-router-dom';
import { BookOpen, ChefHat, LineChart, Settings } from 'lucide-react';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { to: '/diary', label: 'Diary', icon: BookOpen },
  { to: '/meals', label: 'Meals', icon: ChefHat },
  { to: '/progress', label: 'Progress', icon: LineChart },
  { to: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Layout() {
  return (
    <div className="flex h-full flex-col bg-background">
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
                    'flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] tap-target',
                    isActive
                      ? 'text-primary font-medium'
                      : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                <Icon className="h-5 w-5" strokeWidth={2.25} />
                <span>{label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
