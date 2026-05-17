import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/Button';
import { Tabs } from '@/components/ui/Tabs';
import { MealsLibrary } from '@/features/meals/MealsLibrary';
import { FoodsLibrary } from '@/features/library/FoodsLibrary';

type LibTab = 'meals' | 'foods';

export function LibraryPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<LibTab>('meals');

  return (
    <>
      <PageHeader
        title="Library"
        trailing={
          tab === 'meals' ? (
            <Button
              size="sm"
              variant="primary"
              onClick={() => navigate('/meals/new')}
              aria-label="New meal"
            >
              <Plus className="h-4 w-4" />
              New
            </Button>
          ) : undefined
        }
      />
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
