import { Select } from '@/components/ui/Select';
import { SettingCard } from './SettingCard';
import { updateProfile } from '@/db/repos/profile';
import type { Profile } from '@/db/types';

interface PreferencesSectionProps {
  profile: Profile;
}

export function PreferencesSection({ profile }: PreferencesSectionProps) {
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
    </SettingCard>
  );
}
