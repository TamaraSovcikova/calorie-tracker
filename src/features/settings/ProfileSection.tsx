import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { LabeledInput } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Button } from '@/components/ui/Button';
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

  const applyTdeeAsTarget = () => {
    if (!previewTdee) return;
    void updateProfile({ kcal_target: previewTdee });
  };

  const weightUnit = profile.units === 'imperial' ? 'lb' : 'kg';
  const heightUnit = profile.units === 'imperial' ? 'in' : 'cm';

  return (
    <SettingCard
      title="Profile"
      description="Used to suggest a daily calorie target (TDEE)."
    >
      <LabeledInput
        label="Name"
        value={form.name}
        onChange={(e) => update('name', e.target.value)}
        onBlur={commit}
      />
      <div className="grid grid-cols-2 gap-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Sex
          </span>
          <Select
            value={form.sex}
            onChange={(e) => {
              const v = e.target.value as Sex | '';
              update('sex', v);
              // Persist the new value directly — going via `commit` would
              // read stale form state (the update above has not applied yet)
              // and write the previous value back.
              void updateProfile({ sex: (v || undefined) as Sex | undefined });
            }}
          >
            <option value="">—</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
          </Select>
        </label>
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
          <option value="">—</option>
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
            Suggested daily calories (TDEE)
          </div>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-semibold tabular-nums">
              {formatKcal(previewTdee)}
              <span className="ml-1 text-sm text-muted-foreground">kcal</span>
            </span>
            <Button
              size="sm"
              variant="primary"
              onClick={applyTdeeAsTarget}
              disabled={previewTdee === profile.kcal_target}
            >
              Use as target
            </Button>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Mifflin-St Jeor × activity multiplier. Adjust to your goal (cut /
            bulk) under Goals.
          </p>
        </div>
      )}
    </SettingCard>
  );
}
