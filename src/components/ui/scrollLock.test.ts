import { beforeEach, describe, expect, it, vi } from 'vitest';

const body = { style: { overflow: '' } };
vi.stubGlobal('document', { body });

const { lockBodyScroll, activeScrollLocks } = await import('./scrollLock');

describe('lockBodyScroll', () => {
  beforeEach(() => {
    expect(activeScrollLocks()).toBe(0);
    body.style.overflow = '';
  });

  it('locks on the first holder and unlocks on the last', () => {
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    expect(body.style.overflow).toBe('hidden');
    a();
    expect(body.style.overflow).toBe('hidden');
    b();
    expect(body.style.overflow).toBe('');
  });

  it('survives the re-run ordering that used to leave the page frozen', () => {
    // Two stacked sheets whose effects re-run in one commit: both clean up,
    // then both set up again, then they close outer-first.
    let inner = lockBodyScroll();
    let outer = lockBodyScroll();
    inner();
    outer();
    inner = lockBodyScroll();
    outer = lockBodyScroll();
    outer();
    inner();
    expect(body.style.overflow).toBe('');
    expect(activeScrollLocks()).toBe(0);
  });

  it('ignores a double release', () => {
    const a = lockBodyScroll();
    const b = lockBodyScroll();
    a();
    a();
    expect(body.style.overflow).toBe('hidden');
    b();
    expect(body.style.overflow).toBe('');
  });
});
