import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { LabeledInput } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { SettingCard } from './SettingCard';
import { updateProfile } from '@/db/repos/profile';
import {
  ACTIVITY_LABELS,
  type ActivityLevel,
  type Sex,
  tdee,
} from '@/lib/tdee';
import {
  inToCm,
  kgToLb,
  lbToKg,
} from '@/lib/units';
import { formatKcal } from '@/lib/macros';
import type { Profile } from '@/db/types';
import { fromLocalDate, todayLocal } from '@/lib/dates';
import { differenceInYears } from 'date-fns';

interface ProfileSectionProps {
  profile: Profile;
}

interface FormState {
  name: string;
  sex: Sex | '';
  dob: string;
  weight: string;
  height: string;
  activity: ActivityLevel | '';
}

function profileToForm(p: Profile): FormState {
  return {
    name: p.name ?? '',
    sex: p.sex ?? '',
    dob: p.dob ?? '',
    weight:
      p.weight_kg === undefined
        ? ''
        : p.units === 'imperial'
          ? kgToLb(p.weight_kg).toFixed(1)
          : p.weight_kg.toString(),
    height:
      p.height_cm === undefined
        ? ''
        : p.units === 'imperial'
          ? Math.round(p.height_cm / 2.54).toString() // total inches
          : p.height_cm.toString(),
    activity: p.activity_level ?? '',
  };
}

function ageFromDob(dob: string): number | undefined {
  if (!dob) return undefined;
  try {
    const yrs = differenceInYears(fromLocalDate(todayLocal()), fromLocalDate(dob));
    return yrs > 0 && yrs < 130 ? yrs : undefined;
  } catch {
    return undefined;
  }
}

export function ProfileSection({ profile }: ProfileSectionProps) {
  const [form, setForm] = useState<FormState>(() => profileToForm(profile));

  useEffect(() => setForm(profileToForm(profile)), [profile]);

  const update = (k: keyof FormState, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  const commit = () => {
    const patch: Partial<Profile> = {
      name: form.name.trim() || undefined,
      sex: (form.sex || undefined) as Sex | undefined,
      dob: form.dob || undefined,
      activity_level: (form.activity || undefined) as ActivityLevel | undefined,
    };
    if (form.weight) {
      const num = parseFloat(form.weight);
      if (Number.isFinite(num)) {
        patch.weight_kg = profile.units === 'imperial' ? lbToKg(num) : num;
      }
    } else {
      patch.weight_kg = undefined;
    }
    if (form.height) {
      const num = parseFloat(form.height);
      if (Number.isFinite(num)) {
        patch.height_cm = profile.units === 'imperial' ? inToCm(num) : num;
      }
    } else {
      patch.height_cm = undefined;
    }
    void updateProfile(patch);
  };

  const previewTdee = useMemo(() => {
    const sex = form.sex || profile.sex;
    const age = ageFromDob(form.dob || profile.dob || '');
    const weightKg =
      form.weight && Number.isFinite(parseFloat(form.weight))
        ? profile.units === 'imperial'
          ? lbToKg(parseFloat(form.weight))
          : parseFloat(form.weight)
        : profile.weight_kg;
    const heightCm =
      form.height && Number.isFinite(parseFloat(form.height))
        ? profile.units === 'imperial'
          ? inToCm(parseFloat(form.height))
          : parseFloat(form.height)
        : profile.height_cm;
    const activity = (form.activity || profile.activity_level) as
      | ActivityLevel
      | undefined;
    if (!sex || !age || !weightKg || !heightCm || !activity) return null;
    return tdee({
      sex,
      ageYears: age,
      weightKg,
      heightCm,
      activity,
    });
  }, [form, profile]);

  const weightUnit = profile.units === 'imperial' ? 'lb' : 'kg';
  const heightUnit = profile.units === 'imperial' ? 'in' : 'cm';

  return (
    <SettingCard
      title="Profile"
      description="Used to suggest a daily calorie target (TDEE)."
      defaultOpen
    >
      <LabeledInput
        label="Name"
        value={form.name}
        onChange={(e) => update('name', e.target.value)}
        onBlur={commit}
      />
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sex
          </span>
          <div className="flex rounded-lg border border-border overflow-hidden" style={{ height: 38 }}>
            {([['female', 'Female'], ['male', 'Male']] as [Sex, string][]).map(([val, label], i) => (
              <button
                key={val}
                type="button"
                onClick={() => {
                  const next = form.sex === val ? '' : val;
                  update('sex', next);
                  void updateProfile({ sex: (next || undefined) as Sex | undefined });
                }}
                className="flex-1 text-sm font-medium transition-colors"
                style={{
                  background: form.sex === val ? 'var(--color-accent-deep)' : 'transparent',
                  color: form.sex === val ? '#fff' : 'var(--color-text-muted)',
                  borderRight: i === 0 ? '1px solid var(--color-border)' : 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <LabeledInput
          label="Date of birth"
          type="date"
          value={form.dob}
          onChange={(e) => update('dob', e.target.value)}
          onBlur={commit}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput
          label="Weight"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={form.weight}
          onChange={(e) => update('weight', e.target.value)}
          onBlur={commit}
          trailing={weightUnit}
        />
        <LabeledInput
          label="Height"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={form.height}
          onChange={(e) => update('height', e.target.value)}
          onBlur={commit}
          trailing={heightUnit}
        />
      </div>
      <label className="block space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Activity level
        </span>
        <Select
          value={form.activity}
          onChange={(e) => {
            const v = e.target.value as ActivityLevel | '';
            update('activity', v);
            void updateProfile({
              activity_level: (v || undefined) as ActivityLevel | undefined,
            });
          }}
        >
          <option value="">-</option>
          {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => (
            <option key={k} value={k}>
              {ACTIVITY_LABELS[k]}
            </option>
          ))}
        </Select>
      </label>

      {previewTdee && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Maintenance (TDEE) {formatKcal(previewTdee)} kcal - pick a goal
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {(
              [
                { key: 'lose', label: 'Lose', delta: -500, sub: '−500 deficit' },
                { key: 'maintain', label: 'Maintain', delta: 0, sub: 'TDEE' },
                { key: 'gain', label: 'Gain', delta: 400, sub: '+400 surplus' },
              ] as const
            ).map((g) => {
              const kcal = Math.max(1000, previewTdee + g.delta);
              const active = profile.kcal_target === kcal;
              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => void updateProfile({ kcal_target: kcal })}
                  className={
                    active
                      ? 'rounded-lg border border-primary bg-primary px-2 py-2 text-center text-primary-foreground'
                      : 'rounded-lg border border-border bg-card px-2 py-2 text-center hover:border-primary'
                  }
                >
                  <div className="text-xs font-medium">{g.label}</div>
                  <div className="text-base font-semibold tabular-nums">
                    {formatKcal(kcal)}
                  </div>
                  <div
                    className={
                      active
                        ? 'text-[10px] text-primary-foreground/80'
                        : 'text-[10px] text-muted-foreground'
                    }
                  >
                    {g.sub}
                  </div>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Mifflin-St Jeor × activity multiplier. Lose ≈ 0.45 kg/week loss;
            gain ≈ lean gain. Tap one to set it as your calorie target.
          </p>
        </div>
      )}
    </SettingCard>
  );
}
