import { useState } from 'react';
import { Switch } from '@/components/ui/Switch';
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

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <div className="flex overflow-hidden rounded-lg border border-border">
        {options.map((opt, i) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className="flex-1 py-2 text-sm font-medium transition-colors"
            style={{
              background: value === opt.value ? 'var(--color-accent-deep)' : 'transparent',
              color: value === opt.value ? '#fff' : 'var(--color-text-muted)',
              borderRight: i < options.length - 1 ? '1px solid var(--color-border)' : 'none',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function PreferencesSection({ profile }: PreferencesSectionProps) {
  const [foodFacts, setFoodFacts] = useState(() => isFoodFactsEnabled());
  const [contribute, setContribute] = useState(() => getContributeShared());

  return (
    <SettingCard title="Preferences">
      <SegmentedControl
        label="Units"
        value={profile.units ?? 'metric'}
        options={[
          { value: 'metric', label: 'Metric' },
          { value: 'imperial', label: 'Imperial' },
        ]}
        onChange={(v) => void updateProfile({ units: v as Profile['units'] })}
      />

      <SegmentedControl
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
