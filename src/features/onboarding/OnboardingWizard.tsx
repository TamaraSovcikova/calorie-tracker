import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Library,
  LineChart,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Dog } from '@/features/pet/Dog';
import { useProfile, updateProfile } from '@/db/repos/profile';
import { renamePet } from '@/db/repos/pet';
import {
  ACTIVITY_LABELS,
  type ActivityLevel,
  type Sex,
  tdee,
} from '@/lib/tdee';
import { inToCm, lbToKg } from '@/lib/units';
import { formatKcal } from '@/lib/macros';
import { fromLocalDate, todayLocal } from '@/lib/dates';
import { differenceInYears } from 'date-fns';
import { cn } from '@/lib/cn';
import type { Profile } from '@/db/types';

/**
 * Renders nothing once the profile reports `onboarded: true`. While loading
 * we render a fullscreen blank to avoid flashing the diary briefly.
 */
export function OnboardingGate() {
  const profile = useProfile();
  if (!profile) return null;
  if (profile.onboarded) return null;
  return <OnboardingWizard profile={profile} />;
}

type StepId = 'welcome' | 'pet' | 'goals' | 'profile' | 'macros' | 'done';
// Profile (with its TDEE + goal picker) comes before the calorie target so
// the goal pick can pre-fill it, rather than asking for a blind number first.
const STEPS: StepId[] = ['welcome', 'pet', 'profile', 'goals', 'macros', 'done'];

function OnboardingWizard({ profile }: { profile: Profile }) {
  const [step, setStep] = useState<StepId>('welcome');

  // Local draft mirrors the profile but only writes back when the user moves
  // forward - avoids clobbering on every keystroke.
  const [draft, setDraft] = useState(() => ({
    kcal_target: String(profile.kcal_target),
    primary_macro: profile.primary_macro,
    units: profile.units,
    name: profile.name ?? '',
    sex: (profile.sex ?? '') as Sex | '',
    dob: profile.dob ?? '',
    weight: profile.weight_kg ? String(profile.weight_kg) : '',
    height: profile.height_cm ? String(profile.height_cm) : '',
    activity: (profile.activity_level ?? '') as ActivityLevel | '',
    protein: String(profile.protein_g),
    carbs: String(profile.carbs_g),
    fat: String(profile.fat_g),
    petName: 'Biscuit',
  }));

  const update = <K extends keyof typeof draft>(k: K, v: (typeof draft)[K]) =>
    setDraft((s) => ({ ...s, [k]: v }));

  const goNext = () => {
    const idx = STEPS.indexOf(step);
    setStep(STEPS[Math.min(idx + 1, STEPS.length - 1)]);
  };
  const goBack = () => {
    const idx = STEPS.indexOf(step);
    setStep(STEPS[Math.max(idx - 1, 0)]);
  };

  const skipAll = () => void updateProfile({ onboarded: true });

  const finish = async () => {
    const patch: Partial<Profile> = {
      onboarded: true,
      kcal_target: parseNum(draft.kcal_target, profile.kcal_target),
      protein_g: parseNum(draft.protein, profile.protein_g),
      carbs_g: parseNum(draft.carbs, profile.carbs_g),
      fat_g: parseNum(draft.fat, profile.fat_g),
      primary_macro: draft.primary_macro,
      units: draft.units,
      name: draft.name.trim() || undefined,
      sex: (draft.sex || undefined) as Sex | undefined,
      dob: draft.dob || undefined,
      activity_level: (draft.activity || undefined) as ActivityLevel | undefined,
    };
    if (draft.weight) {
      const n = parseFloat(draft.weight);
      if (Number.isFinite(n)) {
        patch.weight_kg = draft.units === 'imperial' ? lbToKg(n) : n;
      }
    }
    if (draft.height) {
      const n = parseFloat(draft.height);
      if (Number.isFinite(n)) {
        patch.height_cm = draft.units === 'imperial' ? inToCm(n) : n;
      }
    }
    await updateProfile(patch);
    await renamePet(draft.petName.trim() || 'Biscuit');
  };

  const tdeePreview = useMemo(() => {
    const sex = draft.sex;
    const weightVal = parseFloat(draft.weight);
    const heightVal = parseFloat(draft.height);
    const ageYears =
      draft.dob && Number.isFinite(differenceInYears(fromLocalDate(todayLocal()), fromLocalDate(draft.dob)))
        ? differenceInYears(fromLocalDate(todayLocal()), fromLocalDate(draft.dob))
        : undefined;
    const activity = draft.activity;
    if (
      !sex ||
      !ageYears ||
      !Number.isFinite(weightVal) ||
      !Number.isFinite(heightVal) ||
      !activity
    ) {
      return null;
    }
    return tdee({
      sex,
      ageYears,
      weightKg: draft.units === 'imperial' ? lbToKg(weightVal) : weightVal,
      heightCm: draft.units === 'imperial' ? inToCm(heightVal) : heightVal,
      activity,
    });
  }, [draft]);

  // Auto-suggest macro split (30P / 40C / 30F) when entering the macros step.
  useEffect(() => {
    if (step !== 'macros') return;
    const kcal = parseFloat(draft.kcal_target);
    if (!Number.isFinite(kcal) || kcal <= 0) return;
    const protein = Math.round((kcal * 0.3) / 4);
    const carbs = Math.round((kcal * 0.4) / 4);
    const fat = Math.round((kcal * 0.3) / 9);
    setDraft((s) => ({
      ...s,
      protein: s.protein || String(protein),
      carbs: s.carbs || String(carbs),
      fat: s.fat || String(fat),
    }));
    // run only when the step transitions to 'macros'
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const stepIdx = STEPS.indexOf(step);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-background">
      <ProgressBar step={stepIdx} total={STEPS.length} />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-5 py-8">
        {step === 'welcome' && (
          <Welcome onNext={goNext} onSkip={skipAll} />
        )}
        {step === 'pet' && (
          <PetStep
            name={draft.petName}
            onChangeName={(v) => update('petName', v)}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 'goals' && (
          <GoalsStep
            kcal={draft.kcal_target}
            primary={draft.primary_macro}
            onChangeKcal={(v) => update('kcal_target', v)}
            onChangePrimary={(v) => update('primary_macro', v)}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 'profile' && (
          <ProfileStep
            draft={draft}
            update={update}
            tdeePreview={tdeePreview}
            onPickKcal={(kcal) => update('kcal_target', String(kcal))}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 'macros' && (
          <MacrosStep
            kcal={draft.kcal_target}
            protein={draft.protein}
            carbs={draft.carbs}
            fat={draft.fat}
            onChange={update}
            onNext={goNext}
            onBack={goBack}
          />
        )}
        {step === 'done' && <DoneStep onFinish={finish} onBack={goBack} />}
      </div>
    </div>
  );
}

function parseNum(s: string, fallback: number): number {
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="h-1 w-full bg-muted">
      <div
        className="h-full bg-primary transition-all duration-300"
        style={{ width: `${((step + 1) / total) * 100}%` }}
      />
    </div>
  );
}

function Welcome({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <Sparkles className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">Let's set you up</h1>
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">
          A few quick questions so the diary shows the right targets. Takes
          about a minute. You can change everything later in Settings.
        </p>
      </div>
      <div className="space-y-2">
        <Button onClick={onNext} block size="lg">
          Get started
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" block onClick={onSkip}>
          Skip for now
        </Button>
      </div>
    </div>
  );
}

function PetStep({
  name,
  onChangeName,
  onNext,
  onBack,
}: {
  name: string;
  onChangeName: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header>
        <h1 className="text-2xl font-semibold">Meet your dog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Logging your meals feeds and cheers up your companion. What should
          they be called?
        </p>
      </header>
      <div className="my-6 flex justify-center">
        <Dog pose="happy" className="h-40 w-40" />
      </div>
      <LabeledInput
        label="Dog's name"
        value={name}
        onChange={(e) => onChangeName(e.target.value)}
        autoFocus
      />
      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={!name.trim()} />
    </div>
  );
}

function GoalsStep({
  kcal,
  primary,
  onChangeKcal,
  onChangePrimary,
  onNext,
  onBack,
}: {
  kcal: string;
  primary: Profile['primary_macro'];
  onChangeKcal: (v: string) => void;
  onChangePrimary: (v: Profile['primary_macro']) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header>
        <h1 className="text-2xl font-semibold">Daily calorie target</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Your goal pick set this - tweak it here, or enter your own number.
        </p>
      </header>
      <div className="mt-6 space-y-4">
        <LabeledInput
          label="Calorie target"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={kcal}
          onChange={(e) => onChangeKcal(e.target.value)}
          autoFocus
          trailing="kcal"
        />
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Macro shown alongside kcal in the diary
          </span>
          <Select
            value={primary}
            onChange={(e) =>
              onChangePrimary(e.target.value as Profile['primary_macro'])
            }
          >
            <option value="protein">Protein (recommended)</option>
            <option value="carbs">Carbs</option>
            <option value="fat">Fat</option>
          </Select>
        </label>
      </div>
      <NavButtons onBack={onBack} onNext={onNext} nextDisabled={!parseFloat(kcal)} />
    </div>
  );
}

const MACRO_PRESETS = [
  { key: 'balanced', label: 'Balanced', p: 0.3, c: 0.4, f: 0.3 },
  { key: 'high-protein', label: 'High protein', p: 0.4, c: 0.35, f: 0.25 },
  { key: 'low-carb', label: 'Low carb', p: 0.35, c: 0.2, f: 0.45 },
] as const;

const GOAL_OPTIONS = [
  { key: 'lose', label: 'Lose', delta: -500, sub: '−500 deficit' },
  { key: 'maintain', label: 'Maintain', delta: 0, sub: 'TDEE' },
  { key: 'gain', label: 'Gain', delta: 400, sub: '+400 surplus' },
] as const;

function ProfileStep({
  draft,
  update,
  tdeePreview,
  onPickKcal,
  onNext,
  onBack,
}: {
  draft: Draft;
  update: <K extends keyof Draft>(k: K, v: Draft[K]) => void;
  tdeePreview: number | null;
  onPickKcal: (kcal: number) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <header>
        <h1 className="text-2xl font-semibold">A bit about you</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional - fills in to suggest a TDEE-based calorie target.
        </p>
      </header>
      <div className="mt-5 space-y-3">
        <LabeledInput
          label="Name (optional)"
          value={draft.name}
          onChange={(e) => update('name', e.target.value)}
        />
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sex
            </span>
            <Select
              value={draft.sex}
              onChange={(e) => update('sex', e.target.value as Sex | '')}
            >
              <option value="">-</option>
              <option value="female">Female</option>
              <option value="male">Male</option>
            </Select>
          </label>
          <LabeledInput
            label="Date of birth"
            type="date"
            value={draft.dob}
            onChange={(e) => update('dob', e.target.value)}
          />
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Units
          </span>
          <Select
            value={draft.units}
            onChange={(e) => update('units', e.target.value as Profile['units'])}
          >
            <option value="metric">Metric (kg / cm)</option>
            <option value="imperial">Imperial (lb / in)</option>
          </Select>
        </label>
        <div className="grid grid-cols-2 gap-2">
          <LabeledInput
            label="Weight"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={draft.weight}
            onChange={(e) => update('weight', e.target.value)}
            trailing={draft.units === 'imperial' ? 'lb' : 'kg'}
          />
          <LabeledInput
            label="Height"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={draft.height}
            onChange={(e) => update('height', e.target.value)}
            trailing={draft.units === 'imperial' ? 'in' : 'cm'}
          />
        </div>
        <label className="block space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Activity level
          </span>
          <Select
            value={draft.activity}
            onChange={(e) =>
              update('activity', e.target.value as ActivityLevel | '')
            }
          >
            <option value="">-</option>
            {(Object.keys(ACTIVITY_LABELS) as ActivityLevel[]).map((k) => (
              <option key={k} value={k}>
                {ACTIVITY_LABELS[k]}
              </option>
            ))}
          </Select>
        </label>

        {tdeePreview && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Maintenance {formatKcal(tdeePreview)} kcal - pick a goal
            </div>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {GOAL_OPTIONS.map((g) => {
                const kcal = Math.max(1000, tdeePreview + g.delta);
                const active = parseFloat(draft.kcal_target) === kcal;
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => onPickKcal(kcal)}
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
              Based on Mifflin-St Jeor × your activity level. Tap a goal to set
              your target - you can fine-tune it on the next screen.
            </p>
          </div>
        )}
      </div>
      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

function MacrosStep({
  kcal,
  protein,
  carbs,
  fat,
  onChange,
  onNext,
  onBack,
}: {
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
  onChange: <K extends 'protein' | 'carbs' | 'fat'>(k: K, v: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const sum =
    (parseFloat(protein) || 0) * 4 +
    (parseFloat(carbs) || 0) * 4 +
    (parseFloat(fat) || 0) * 9;
  const target = parseFloat(kcal);
  const drift = target > 0 ? Math.abs(sum - target) / target : 0;

  const applyPreset = (p: { p: number; c: number; f: number }) => {
    if (!(target > 0)) return;
    onChange('protein', String(Math.round((target * p.p) / 4)));
    onChange('carbs', String(Math.round((target * p.c) / 4)));
    onChange('fat', String(Math.round((target * p.f) / 9)));
  };

  return (
    <div className="flex flex-1 flex-col">
      <header>
        <h1 className="text-2xl font-semibold">Macros</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pick a split to start from, then tweak the grams as you like.
        </p>
      </header>
      <div className="mt-4 flex flex-wrap gap-2">
        {MACRO_PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            onClick={() => applyPreset(preset)}
            disabled={!(target > 0)}
            className="rounded-full border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium hover:border-primary disabled:opacity-50"
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <LabeledInput
          label="Protein"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={protein}
          onChange={(e) => onChange('protein', e.target.value)}
          trailing="g"
        />
        <LabeledInput
          label="Carbs"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={carbs}
          onChange={(e) => onChange('carbs', e.target.value)}
          trailing="g"
        />
        <LabeledInput
          label="Fat"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={fat}
          onChange={(e) => onChange('fat', e.target.value)}
          trailing="g"
        />
      </div>
      <p
        className={cn(
          'mt-3 text-xs',
          drift > 0.1 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
        )}
      >
        Macros sum to {formatKcal(sum)} kcal of your {formatKcal(target)} target.
      </p>
      <NavButtons onBack={onBack} onNext={onNext} />
    </div>
  );
}

function DoneStep({ onFinish, onBack }: { onFinish: () => void; onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="rounded-full bg-primary/10 p-4">
          <CheckCircle2 className="h-8 w-8 text-primary" />
        </div>
        <h1 className="mt-6 text-2xl font-semibold">All set</h1>
        <p className="mt-2 max-w-xs text-center text-sm text-muted-foreground">
          Here's where everything lives:
        </p>
        <ul className="mt-5 w-full max-w-xs space-y-3">
          <FeatureRow
            icon={BookOpen}
            title="Diary"
            desc="Log meals, scan barcodes, quick-add calories."
          />
          <FeatureRow
            icon={Library}
            title="Library"
            desc="Save meals and custom foods to reuse."
          />
          <FeatureRow
            icon={LineChart}
            title="Progress"
            desc="Streak, weekly trends, and weight log."
          />
        </ul>
      </div>
      <NavButtons onBack={onBack} onNext={onFinish} nextLabel="Open diary" />
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  desc,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <div className="shrink-0 rounded-lg bg-muted p-2">
        <Icon className="h-4 w-4 text-foreground" />
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
    </li>
  );
}

function NavButtons({
  onBack,
  onNext,
  nextLabel = 'Continue',
  nextDisabled = false,
}: {
  onBack: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
}) {
  return (
    <div className="mt-6 flex gap-2 pt-2">
      <Button variant="ghost" onClick={onBack} className="flex-1">
        Back
      </Button>
      <Button
        variant="primary"
        onClick={onNext}
        disabled={nextDisabled}
        className="flex-[2]"
      >
        {nextLabel}
        <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

interface Draft {
  kcal_target: string;
  primary_macro: Profile['primary_macro'];
  units: Profile['units'];
  name: string;
  sex: Sex | '';
  dob: string;
  weight: string;
  height: string;
  activity: ActivityLevel | '';
  protein: string;
  carbs: string;
  fat: string;
  petName: string;
}
