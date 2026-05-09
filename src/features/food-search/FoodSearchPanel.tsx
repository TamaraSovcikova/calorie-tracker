import { useState } from 'react';
import { Loader2, Plus, Search } from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useFoodSearch } from './useFoodSearch';
import { FoodResultRow } from './FoodResultRow';
import type { Food, MealSection } from '@/db/types';

interface FoodSearchPanelProps {
  section: MealSection;
  onPick: (food: Food) => void;
  onManualEntry: (presetName: string) => void;
}

const SECTION_TITLES: Record<MealSection, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snacks: 'Snacks',
};

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="px-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div>{children}</div>
    </section>
  );
}

export function FoodSearchPanel({
  section,
  onPick,
  onManualEntry,
}: FoodSearchPanelProps) {
  const [query, setQuery] = useState('');
  const { recents, local, off, isSearching, rateLimitedSeconds, offError } =
    useFoodSearch(query, section);

  const showRecents = query.trim().length === 0 && recents.length > 0;
  const showResults = query.trim().length > 0;
  const noResults =
    showResults && !isSearching && local.length === 0 && off.length === 0;

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 space-y-3 border-b border-border bg-card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search foods…"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          {isSearching && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Adding to{' '}
          <span className="font-medium text-foreground">
            {SECTION_TITLES[section]}
          </span>
        </p>
      </div>

      {(rateLimitedSeconds || offError) && (
        <div className="mx-4 mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          {rateLimitedSeconds != null
            ? `Open Food Facts rate limit hit. Showing local results only — try again in ${rateLimitedSeconds}s.`
            : `Open Food Facts unreachable. ${offError}`}
        </div>
      )}

      <div className="flex-1 space-y-4 px-2 py-3">
        {showRecents && (
          <Group title={`Recent in ${SECTION_TITLES[section]}`}>
            {recents.map((f) => (
              <FoodResultRow key={f.id} food={f} onClick={onPick} />
            ))}
          </Group>
        )}

        {!showRecents && !showResults && (
          <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Search by name, scan a barcode, or pick a saved meal.
          </div>
        )}

        {showResults && (
          <>
            {local.length > 0 && (
              <Group title="My Products & saved">
                {local.map((f) => (
                  <FoodResultRow key={f.id} food={f} onClick={onPick} />
                ))}
              </Group>
            )}

            {off.length > 0 && (
              <Group title="Open Food Facts">
                {off.map((f) => (
                  <FoodResultRow key={f.id} food={f} onClick={onPick} />
                ))}
              </Group>
            )}

            {noResults && (
              <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                No matches. Add it manually below.
              </div>
            )}

            <div className="px-2">
              <Button
                type="button"
                variant="secondary"
                block
                onClick={() => onManualEntry(query.trim())}
              >
                <Plus className="h-4 w-4" />
                Add "{query.trim() || 'new product'}" manually
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
