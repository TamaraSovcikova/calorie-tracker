import { useEffect } from 'react';
import { useProfile } from '@/db/repos/profile';

/**
 * Applies the theme stored on the profile to <html>. When set to 'system',
 * watches prefers-color-scheme so the user gets the right look immediately
 * after toggling dark mode in their OS.
 */
export function useThemeEffect() {
  const profile = useProfile();
  const choice = profile?.theme ?? 'system';

  useEffect(() => {
    const root = document.documentElement;
    const apply = (dark: boolean) => {
      root.classList.toggle('dark', dark);
    };
    if (choice === 'dark') {
      apply(true);
      return;
    }
    if (choice === 'light') {
      apply(false);
      return;
    }
    // system
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    apply(mql.matches);
    const handler = (e: MediaQueryListEvent) => apply(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, [choice]);
}
