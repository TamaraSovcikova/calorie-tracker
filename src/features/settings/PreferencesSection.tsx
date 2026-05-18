import { useState } from 'react';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { SettingCard } from './SettingCard';
import { updateProfile } from '@/db/repos/profile';
import {
  isFoodFactsEnabled,
  setFoodFactsEnabled,
} from '@/features/food-facts/factSettings';
import type { Profile } from '@/db/types';

interface PreferencesSectionProps {
  profile: Profile;
}

export function PreferencesSection({ profile }: PreferencesSectionProps) {
  const [foodFacts, setFoodFacts] = useState(() => isFoodFactsEnabled());

  return (
    <SettingCard title="Preferences">
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Units
        </span>
        <Select
          value={profile.units}
          onChange={(e) =>
            void updateProfile({ units: e.target.value as Profile['units'] })
          }
        >
          <option value="metric">Metric (kg, cm, g)</option>
          <option value="imperial">Imperial (lb, in, oz)</option>
        </Select>
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Theme
        </span>
        <Select
          value={profile.theme}
          onChange={(e) =>
            void updateProfile({ theme: e.target.value as Profile['theme'] })
          }
        >
          <option value="system">Match system</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </Select>
      </label>

      <div className="border-t border-border pt-1">
        <Switch
          label="Food facts when logging"
          description="Now and then, show a quick nutrition fact about a food you just logged."
          checked={foodFacts}
          onChange={(next) => {
            setFoodFacts(next);
            setFoodFactsEnabled(next);
          }}
        />
      </div>
    </SettingCard>
  );
}
