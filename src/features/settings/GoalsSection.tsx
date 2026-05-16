import { useEffect, useState } from 'react';
import { LabeledInput } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { SettingCard } from './SettingCard';
import { updateProfile } from '@/db/repos/profile';
import { formatKcal } from '@/lib/macros';
import type { Profile } from '@/db/types';

interface GoalsSectionProps {
  profile: Profile;
}

interface FormState {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
}

function profileToForm(p: Profile): FormState {
  return {
    kcal: String(p.kcal_target),
    protein: String(p.protein_g),
    carbs: String(p.carbs_g),
    fat: String(p.fat_g),
  };
}

export function GoalsSection({ profile }: GoalsSectionProps) {
  const [form, setForm] = useState<FormState>(() => profileToForm(profile));

  // Sync from profile when external changes happen.
  useEffect(() => setForm(profileToForm(profile)), [profile]);

  const update = (k: keyof FormState, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  const commit = (k: keyof FormState) => {
    const num = parseFloat(form[k]);
    if (!Number.isFinite(num) || num < 0) {
      // revert if invalid
      setForm(profileToForm(profile));
      return;
    }
    const map: Record<keyof FormState, keyof Profile> = {
      kcal: 'kcal_target',
      protein: 'protein_g',
      carbs: 'carbs_g',
      fat: 'fat_g',
    };
    void updateProfile({ [map[k]]: num });
  };

  // Validation: warn if macros don't sum near kcal target.
  const proteinKcal = parseFloat(form.protein) * 4;
  const carbsKcal = parseFloat(form.carbs) * 4;
  const fatKcal = parseFloat(form.fat) * 9;
  const macroSum = (proteinKcal || 0) + (carbsKcal || 0) + (fatKcal || 0);
  const targetKcal = parseFloat(form.kcal) || 0;
  const drift = targetKcal > 0 ? Math.abs(macroSum - targetKcal) / targetKcal : 0;
  const macroWarning = drift > 0.1 && targetKcal > 0;

  return (
    <SettingCard
      title="Goals"
      description="Daily targets for calories and macros."
    >
      <LabeledInput
        label="Calorie target"
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        value={form.kcal}
        onChange={(e) => update('kcal', e.target.value)}
        onBlur={() => commit('kcal')}
        trailing="kcal"
      />
      <div className="grid grid-cols-3 gap-2">
        <LabeledInput
          label="Protein"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={form.protein}
          onChange={(e) => update('protein', e.target.value)}
          onBlur={() => commit('protein')}
          trailing="g"
        />
        <LabeledInput
          label="Carbs"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={form.carbs}
          onChange={(e) => update('carbs', e.target.value)}
          onBlur={() => commit('carbs')}
          trailing="g"
        />
        <LabeledInput
          label="Fat"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={form.fat}
          onChange={(e) => update('fat', e.target.value)}
          onBlur={() => commit('fat')}
          trailing="g"
        />
      </div>
      {macroWarning && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          Macros sum to {formatKcal(macroSum)} kcal — that's{' '}
          {Math.round(drift * 100)}% off your {formatKcal(targetKcal)} target.
          You can keep them out of sync, but consider adjusting.
        </div>
      )}

      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Primary macro shown alongside kcal
        </span>
        <Select
          value={profile.primary_macro}
          onChange={(e) =>
            void updateProfile({
              primary_macro: e.target.value as Profile['primary_macro'],
            })
          }
        >
          <option value="protein">Protein</option>
          <option value="carbs">Carbs</option>
          <option value="fat">Fat</option>
        </Select>
      </label>

      <Switch
        label="Add burned calories to my target"
        description="Off: exercise + Fitbit activity calories are shown but don't change your target. On: your daily target rises by activity calories burned (Fitbit activity = total burn minus estimated resting burn)."
        checked={profile.eat_back_burned}
        onChange={(v) => void updateProfile({ eat_back_burned: v })}
      />
    </SettingCard>
  );
}
