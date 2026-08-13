import { useEffect, useState } from 'react';
import { LabeledInput } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/Switch';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { SettingCard } from './SettingCard';
import { updateProfile } from '@/db/repos/profile';
import { formatKcal } from '@/lib/macros';
import {
  resolveBudgetMode,
  WEEK_DAY_LABELS,
  type BudgetMode,
} from '@/features/weekly-budget/weeklyBudget';
import { shiftDate, todayLocal } from '@/lib/dates';
import type { Profile } from '@/db/types';

const BUDGET_MODES: [BudgetMode, string][] = [
  ['off', 'Off'],
  ['warn', 'Warn only'],
  ['adjust', 'Auto-adjust'],
];

const MODE_HELP: Record<BudgetMode, string> = {
  off: 'Every day gets the same target. Nothing rolls forward.',
  warn:
    "Your target never moves. Days over it just read as over, and a running balance shows how far ahead or behind you are - so evening it out is your call, at your pace.",
  adjust:
    "Each day's target is recalculated from the period's remaining budget. Going over one day trims the rest; going under banks calories forward.",
};

/** Quick windows for the carry-over start date. */
const CARRY_PRESETS: [string, number][] = [
  ['Last 2 weeks', 14],
  ['Last month', 30],
  ['Last 3 months', 90],
];

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

  const mode = resolveBudgetMode(profile);
  const carryoverOn = !!profile.budget_carryover_start;
  // A fresh carry-over window opens two weeks back: enough to be useful,
  // short enough that turning it on never drags in months of history.
  const defaultCarryStart = shiftDate(todayLocal(), -14);

  // `weekly_budget_enabled` is kept in step so older clients and the pet's
  // roll-forward keep reading the same on/off state through sync.
  const setBudgetMode = (next: BudgetMode) =>
    void updateProfile({
      budget_mode: next,
      weekly_budget_enabled: next !== 'off',
    });

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
      defaultOpen
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
          Macros sum to {formatKcal(macroSum)} kcal - that's{' '}
          {Math.round(drift * 100)}% off your {formatKcal(targetKcal)} target.
          You can keep them out of sync, but consider adjusting.
        </div>
      )}

      <SegmentedControl
        label="Primary macro shown alongside kcal"
        variant="solid"
        value={profile.primary_macro ?? 'protein'}
        onChange={(m) => void updateProfile({ primary_macro: m })}
        options={[
          { value: 'protein', label: 'Protein' },
          { value: 'carbs', label: 'Carbs' },
          { value: 'fat', label: 'Fat' },
        ]}
      />

      <Switch
        label="Add burned calories to my target"
        description="Off: exercise + health activity calories are shown but don't change your target. On: your daily target rises by activity calories burned (health activity = total burn minus estimated resting burn)."
        checked={profile.eat_back_burned}
        onChange={(v) => void updateProfile({ eat_back_burned: v })}
      />

      <div className="space-y-1">
        <SegmentedControl
          label="Calorie budget"
          variant="solid"
          value={mode}
          onChange={setBudgetMode}
          options={BUDGET_MODES.map(([value, label]) => ({ value, label }))}
        />
        <p className="text-xs text-muted-foreground">{MODE_HELP[mode]}</p>
      </div>

      {mode !== 'off' && (
        <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
          <SegmentedControl
            label="Budget period"
            variant="solid"
            value={profile.budget_period ?? 'week'}
            onChange={(v) => void updateProfile({ budget_period: v })}
            options={[
              { value: 'week', label: 'Weekly' },
              { value: 'month', label: 'Monthly' },
            ]}
          />

          {(profile.budget_period ?? 'week') === 'week' && (
            <label className="block space-y-1">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Week starts on
              </span>
              <Select
                value={String(profile.week_start_day ?? 1)}
                onChange={(e) =>
                  void updateProfile({
                    week_start_day: parseInt(e.target.value, 10),
                  })
                }
              >
                {WEEK_DAY_LABELS.map((label, i) => (
                  <option key={label} value={i}>
                    {label}
                  </option>
                ))}
              </Select>
            </label>
          )}

          <Switch
            label="Carry over between periods"
            description="Keep a running balance instead of wiping the slate every period. It accumulates from the start date below and never reaches back further, so it covers a window you chose rather than your whole history."
            checked={carryoverOn}
            onChange={(v) =>
              void updateProfile({
                budget_carryover_start: v ? defaultCarryStart : undefined,
              })
            }
          />

          {carryoverOn && (
            <>
              <LabeledInput
                label="Count from"
                type="date"
                max={todayLocal()}
                hint="Nothing before this date is counted. Move it forward any time to start fresh."
                value={profile.budget_carryover_start ?? defaultCarryStart}
                onChange={(e) => {
                  if (e.target.value) {
                    void updateProfile({ budget_carryover_start: e.target.value });
                  }
                }}
              />
              <div className="flex flex-wrap gap-1.5">
                {CARRY_PRESETS.map(([label, days]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() =>
                      void updateProfile({
                        budget_carryover_start: shiftDate(todayLocal(), -days),
                      })
                    }
                    className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() =>
                    void updateProfile({ budget_carryover_start: todayLocal() })
                  }
                  className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Reset to today
                </button>
              </div>
              <LabeledInput
                label="Carry-over cap (optional)"
                type="number"
                inputMode="numeric"
                step="any"
                min="0"
                placeholder="No cap"
                hint="Limits how big the carried balance can get, in either direction."
                value={
                  profile.budget_carryover_cap && profile.budget_carryover_cap > 0
                    ? String(profile.budget_carryover_cap)
                    : ''
                }
                onChange={(e) => {
                  const n = parseFloat(e.target.value);
                  void updateProfile({
                    budget_carryover_cap:
                      Number.isFinite(n) && n > 0 ? n : undefined,
                  });
                }}
                trailing="kcal"
              />
            </>
          )}

          {mode === 'warn' && (
            <LabeledInput
              label="Work off the balance at (optional)"
              type="number"
              inputMode="numeric"
              step="any"
              min="0"
              placeholder="Don't touch my target"
              hint="While you're over, take this much off your daily target to chip away at it. Put 150 here and you'll aim 150 lower each day until the balance clears - it never takes off more than you actually owe, and it stops on its own."
              value={
                profile.budget_warn_catchup && profile.budget_warn_catchup > 0
                  ? String(profile.budget_warn_catchup)
                  : ''
              }
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                void updateProfile({
                  budget_warn_catchup: Number.isFinite(n) && n > 0 ? n : 0,
                });
              }}
              trailing="kcal/day"
            />
          )}

          {mode === 'adjust' && (
            <LabeledInput
              label="Most a day may be trimmed (optional)"
              type="number"
              inputMode="numeric"
              step="any"
              min="0"
              placeholder="No limit"
              hint="Your pace for clearing a deficit. With 200 here, no day's target ever drops more than 200 kcal below your goal, however far behind the balance gets."
              value={
                profile.budget_max_daily_trim && profile.budget_max_daily_trim > 0
                  ? String(profile.budget_max_daily_trim)
                  : ''
              }
              onChange={(e) => {
                const n = parseFloat(e.target.value);
                void updateProfile({
                  budget_max_daily_trim:
                    Number.isFinite(n) && n > 0 ? n : 0,
                  // Explicit 0 retires the legacy 70% floor for this profile.
                  weekly_budget_floor: false,
                });
              }}
              trailing="kcal"
            />
          )}
        </div>
      )}
    </SettingCard>
  );
}
