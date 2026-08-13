import { useState } from 'react';
import { Switch } from '@/components/ui/Switch';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SettingCard } from './SettingCard';
import { updateProfile } from '@/db/repos/profile';
import {
  isFoodFactsEnabled,
  setFoodFactsEnabled,
} from '@/features/food-facts/factSettings';
import {
  getContributeShared,
  setContributeShared,
} from './foodSourceSettings';
import type { Profile } from '@/db/types';

interface PreferencesSectionProps {
  profile: Profile;
}

/** Local wrapper: this section only ever wants the solid variant. */
function Segmented<T extends string>(
  props: Omit<React.ComponentProps<typeof SegmentedControl<T>>, 'variant'>,
) {
  return <SegmentedControl<T> {...props} variant="solid" />;
}

export function PreferencesSection({ profile }: PreferencesSectionProps) {
  const [foodFacts, setFoodFacts] = useState(() => isFoodFactsEnabled());
  const [contribute, setContribute] = useState(() => getContributeShared());

  return (
    <SettingCard title="Preferences">
      <Segmented
        label="Units"
        value={profile.units ?? 'metric'}
        options={[
          { value: 'metric', label: 'Metric' },
          { value: 'imperial', label: 'Imperial' },
        ]}
        onChange={(v) => void updateProfile({ units: v as Profile['units'] })}
      />

      <Segmented
        label="Theme"
        value={profile.theme ?? 'system'}
        options={[
          { value: 'system', label: 'Auto' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
        onChange={(v) => void updateProfile({ theme: v as Profile['theme'] })}
      />

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

      <div className="border-t border-border pt-1">
        <Switch
          label="Contribute to community foods"
          description="Share products you add manually to a community database, and see others' - so common items are already there next time. Publishes the name and macros, never your diary."
          checked={contribute}
          onChange={(next) => {
            setContribute(next);
            setContributeShared(next);
          }}
        />
      </div>
    </SettingCard>
  );
}
