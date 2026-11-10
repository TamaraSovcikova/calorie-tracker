/**
 * Background scroll lock shared by every modal surface.
 *
 * Each Sheet used to remember `body.style.overflow` on open and write that
 * value back on close. With two sheets open and their effects re-running in
 * the same commit, the outer sheet ended up remembering 'hidden' as "the
 * previous value" and restored it on close, so the page stayed frozen until
 * a reload. The meal editor scrolls the document, so it was the screen that
 * showed it. A counter cannot be corrupted by ordering: the lock goes on at
 * 0 -> 1 and comes off at 1 -> 0, whoever releases last.
 */
let locks = 0;

/** Lock background scroll. Returns the release function; safe to call twice. */
export function lockBodyScroll(): () => void {
  locks += 1;
  if (locks === 1) document.body.style.overflow = 'hidden';
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks = Math.max(0, locks - 1);
    if (locks === 0) document.body.style.overflow = '';
  };
}

/** Test hook. */
export function activeScrollLocks(): number {
  return locks;
}
