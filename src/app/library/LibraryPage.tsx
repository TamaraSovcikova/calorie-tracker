import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { MealsLibrary } from '@/features/meals/MealsLibrary';
import { FoodsLibrary } from '@/features/library/FoodsLibrary';
import { CompareTab } from '@/features/compare/CompareTab';

type LibTab = 'meals' | 'foods' | 'compare';

export function LibraryPage() {
  const [tab, setTab] = useState<LibTab>('meals');
  const [filter, setFilter] = useState('all');

  const switchTab = (next: LibTab) => {
    setTab(next);
    setFilter('all');
  };

  return (
    <>
      <PageHeader
        variant="display"
        eyebrow="Saved meals & foods"
        title="Library"
      >
        <div className="mb-3.5 mt-3.5 flex justify-center">
          <SegmentedControl<LibTab>
            value={tab}
            onChange={switchTab}
            aria-label="Library section"
            className="w-[300px] max-w-full"
            options={[
              { value: 'meals', label: 'Meals' },
              { value: 'foods', label: 'Foods' },
              { value: 'compare', label: 'Compare' },
            ]}
          />
        </div>
      </PageHeader>

      {/* Body */}
      <div className="pb-4">
        {tab === 'meals' ? (
          <MealsLibrary filter={filter} setFilter={setFilter} />
        ) : tab === 'foods' ? (
          <div className="mx-auto max-w-md animate-fade-in px-4">
            <FoodsLibrary />
          </div>
        ) : (
          <CompareTab />
        )}
      </div>
    </>
  );
}
