import { useEffect, useState } from 'react';
import { todayLocal } from '@/lib/dates';

const KEY = 'calorie-tracker:pet-greeted';

/**
 * True for a few seconds on the first app open of each day - so the dog
 * greets you once daily. The flag is keyed by local date in localStorage.
 */
export function useDailyGreeting(): boolean {
  const [greeting, setGreeting] = useState(false);

  useEffect(() => {
    if (typeof localStorage === 'undefined') return;
    const today = todayLocal();
    if (localStorage.getItem(KEY) === today) return;
    localStorage.setItem(KEY, today);
    setGreeting(true);
    const t = setTimeout(() => setGreeting(false), 3800);
    return () => clearTimeout(t);
  }, []);

  return greeting;
}
