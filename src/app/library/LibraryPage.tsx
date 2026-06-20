import { useState } from 'react';
import { MealsLibrary } from '@/features/meals/MealsLibrary';
import { FoodsLibrary } from '@/features/library/FoodsLibrary';

type LibTab = 'meals' | 'foods';

export function LibraryPage() {
  const [tab, setTab] = useState<LibTab>('meals');
  const [filter, setFilter] = useState('all');

  const switchTab = (next: LibTab) => {
    setTab(next);
    setFilter('all');
  };

  return (
    <>
      {/* Sticky header */}
      <div
        className="sticky top-0 z-10"
        style={{ background: 'var(--color-bg)', padding: '32px 26px 0' }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.18em',
            color: 'var(--color-text-faint)',
            textTransform: 'uppercase',
          }}
        >
          Saved Meals &amp; Foods
        </div>
        <h1
          style={{
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: '-0.02em',
            marginTop: 5,
            color: 'var(--color-text)',
          }}
        >
          Library
        </h1>

        {/* Custom tab switcher */}
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
          <div
            style={{
              display: 'flex',
              background: 'var(--color-tab-track)',
              borderRadius: 13,
              padding: 3,
              gap: 2,
            }}
          >
            {(['meals', 'foods'] as LibTab[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => switchTab(v)}
                style={{
                  width: 116,
                  height: 38,
                  border: 'none',
                  outline: 'none',
                  cursor: 'pointer',
                  borderRadius: 11,
                  fontSize: 13.5,
                  fontWeight: tab === v ? 600 : 400,
                  fontFamily: 'inherit',
                  letterSpacing: '-0.01em',
                  color: tab === v ? 'var(--color-text)' : 'var(--color-text-muted)',
                  background: tab === v ? 'var(--color-tab-active)' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                {v === 'meals' ? 'Meals' : 'Foods'}
              </button>
            ))}
          </div>
        </div>

        <div style={{ height: 14 }} />
      </div>

      {/* Body */}
      <div className="pb-4">
        {tab === 'meals' ? (
          <MealsLibrary filter={filter} setFilter={setFilter} />
        ) : (
          <div className="mx-auto max-w-md animate-fade-in px-4">
            <FoodsLibrary />
          </div>
        )}
      </div>
    </>
  );
}
