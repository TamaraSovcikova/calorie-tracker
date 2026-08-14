import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AddFoodSheet, type AddFoodTab } from '@/features/food-search/AddFoodSheet';
import { defaultMealSection } from '@/lib/mealTime';
import { todayLocal } from '@/lib/dates';
import type { MealSection } from '@/db/types';

const TABS: readonly AddFoodTab[] = ['search', 'capture', 'scan', 'photo', 'meals', 'quick'];

/**
 * Fast-logging entry point, reached from the installed app's icon shortcuts
 * (long-press → "Quick add" / "Scan"). Opens the full add-food flow straight
 * onto today, with the meal section pre-picked by time of day and an optional
 * ?tab= to jump directly to Scan. Closing returns to the diary.
 */
export function QuickAddPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [section, setSection] = useState<MealSection>(() => defaultMealSection());

  const tabParam = params.get('tab');
  const initialTab = TABS.find((t) => t === tabParam);

  return (
    <div className="min-h-dvh" style={{ background: 'var(--color-bg)' }}>
      <AddFoodSheet
        open
        onClose={() => navigate('/diary')}
        date={todayLocal()}
        section={section}
        onSectionChange={setSection}
        initialTab={initialTab}
      />
    </div>
  );
}
