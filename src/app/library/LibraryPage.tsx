import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Tabs } from '@/components/ui/Tabs';
import { MealsLibrary } from '@/features/meals/MealsLibrary';
import { FoodsLibrary } from '@/features/library/FoodsLibrary';

type LibTab = 'meals' | 'foods';

export function LibraryPage() {
  const [tab, setTab] = useState<LibTab>('meals');

  return (
    <>
      <PageHeader title="Library" />
      <div className="mx-auto max-w-md animate-fade-in space-y-3 px-4 py-4">
        <Tabs<LibTab>
          value={tab}
          onChange={setTab}
          options={[
            { value: 'meals', label: 'Meals' },
            { value: 'foods', label: 'Foods' },
          ]}
        />
        {tab === 'meals' ? <MealsLibrary /> : <FoodsLibrary />}
      </div>
    </>
  );
}
