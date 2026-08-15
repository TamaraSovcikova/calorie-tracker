import { useMemo, useState } from 'react';
import { v4 as uuid } from 'uuid';
import { format } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { SettingCard } from './SettingCard';
import { updateProfile } from '@/db/repos/profile';
import { formatKcal } from '@/lib/macros';
import { fromLocalDate, shiftDate, todayLocal, type LocalDate } from '@/lib/dates';
import {
  endPauseAt,
  maintenanceEstimate,
  parseDietPauses,
  pauseLength,
  pauseMacros,
  removePause,
  serializeDietPauses,
  withPause,
  type DietPause,
} from '@/features/diet-pause/dietPause';
import type { Profile } from '@/db/types';

/** Break lengths worth one tap. Open-ended is the fourth option. */
const LENGTH_PRESETS: [string, number][] = [
  ['3 days', 3],
  ['1 week', 7],
  ['2 weeks', 14],
];

/**
 * Start, run and end a diet pause: a dated window where the daily goal sits
 * at maintenance instead of the cut, after which the cut resumes on its own.
 *
 * The window is a date range rather than a temporary edit to the calorie
 * target, because the budget grades every past day against that day's goal.
 * Editing the target and putting it back would leave the finished break
 * reading as a week of overeating.
 */
export function DietPauseSection({ profile }: { profile: Profile }) {
  const today = todayLocal();
  const pauses = useMemo(
    () => parseDietPauses(profile.diet_pauses),
    [profile.diet_pauses],
  );
  const current = pauses.find(
    (p) => p.start <= today && (p.end === undefined || today <= p.end),
  );
  const planned = pauses.filter((p) => p.start > today);
  const past = pauses.filter((p) => p.end !== undefined && p.end < today).slice(-3);

  const estimate = maintenanceEstimate(profile);
  // The suggestion is TDEE when the profile can produce one; otherwise a
  // plain +400, which is roughly the deficit a moderate cut runs. Either way
  // the field stays editable - the number is the user's, not the app's.
  const suggested = estimate ?? Math.round((profile.kcal_target ?? 2000) + 400);

  const [kcal, setKcal] = useState(String(suggested));
  const [start, setStart] = useState<LocalDate>(today);
  const [days, setDays] = useState<number | null>(7);
  const [note, setNote] = useState('');

  const kcalNum = parseFloat(kcal);
  const kcalValid = Number.isFinite(kcalNum) && kcalNum > 0;
  const end = days === null ? undefined : shiftDate(start, days - 1);
  const preview = kcalValid ? pauseMacros(profile, kcalNum) : null;

  const save = (patch: DietPause[]) =>
    void updateProfile({ diet_pauses: serializeDietPauses(patch) });

  const startPause = () => {
    if (!kcalValid) return;
    const pause: DietPause = {
      id: uuid(),
      start,
      end,
      kcal: Math.round(kcalNum),
      note: note.trim() || undefined,
    };
    save(withPause(pauses, pause));
    setNote('');
  };

  const resumeNow = (p: DietPause) =>
    save(endPauseAt(pauses, p.id, shiftDate(today, -1)));

  const extend = (p: DietPause, extraDays: number) => {
    const from = p.end ?? today;
    save(withPause(pauses, { ...p, end: shiftDate(from, extraDays) }));
  };

  return (
    <SettingCard
      title="Diet pause"
      description="Take a maintenance break without losing the cut. Your target moves to maintenance for the days you choose, then goes back on its own. Past days keep the goal they had, so a finished break never reads as a week of overeating."
    >
      {current ? (
        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
          <div>
            <div className="text-sm font-semibold">
              {current.note || 'Paused'} at {formatKcal(current.kcal)} kcal/day
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {format(fromLocalDate(current.start), 'd MMM')}
              {current.end
                ? ` to ${format(fromLocalDate(current.end), 'd MMM')} (${pauseLength(current)} days)`
                : ' onwards, until you resume'}
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button size="sm" variant="secondary" onClick={() => resumeNow(current)}>
              Resume cut now
            </Button>
            <Button size="sm" variant="outline" onClick={() => extend(current, 3)}>
              +3 days
            </Button>
            <Button size="sm" variant="outline" onClick={() => extend(current, 7)}>
              +1 week
            </Button>
          </div>
          <LabeledInput
            label="Maintenance target"
            type="number"
            inputMode="numeric"
            step="any"
            min="0"
            value={String(current.kcal)}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) {
                save(withPause(pauses, { ...current, kcal: Math.round(n) }));
              }
            }}
            trailing="kcal"
          />
        </div>
      ) : (
        <div className="space-y-3">
          <LabeledInput
            label="Maintenance target"
            type="number"
            inputMode="numeric"
            step="any"
            min="0"
            hint={
              estimate
                ? `Your estimated maintenance is ${formatKcal(estimate)} kcal from the height, weight, age and activity in your profile. Change it if you know better.`
                : 'Fill in sex, date of birth, height, weight and activity under Profile and this can be estimated for you.'
            }
            value={kcal}
            onChange={(e) => setKcal(e.target.value)}
            trailing="kcal"
          />
          {estimate !== null && Math.round(kcalNum) !== estimate && (
            <button
              type="button"
              onClick={() => setKcal(String(estimate))}
              className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
            >
              Use {formatKcal(estimate)} (estimated maintenance)
            </button>
          )}

          <LabeledInput
            label="Starts"
            type="date"
            hint="Today, or a date you already know about."
            value={start}
            onChange={(e) => {
              if (e.target.value) setStart(e.target.value as LocalDate);
            }}
          />

          <div className="space-y-1">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Length
            </span>
            <div className="flex flex-wrap gap-1.5">
              {LENGTH_PRESETS.map(([label, n]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setDays(n)}
                  className={
                    days === n
                      ? 'rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground'
                      : 'rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted'
                  }
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setDays(null)}
                className={
                  days === null
                    ? 'rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground'
                    : 'rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted'
                }
              >
                Until I resume
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {end
                ? `${format(fromLocalDate(start), 'EEE d MMM')} to ${format(fromLocalDate(end), 'EEE d MMM')}. The cut resumes on ${format(fromLocalDate(shiftDate(end, 1)), 'EEE d MMM')}.`
                : 'No end date. The cut resumes when you tap Resume.'}
            </p>
          </div>

          <LabeledInput
            label="Note (optional)"
            placeholder="Diet break"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />

          {preview && (
            <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <div className="font-medium text-foreground">
                While paused: {formatKcal(kcalNum)} kcal/day
              </div>
              <div className="mt-1">
                Protein holds at {Math.round(preview.protein_g)} g. Carbs{' '}
                {profile.carbs_g} to {preview.carbs_g} g, fat {profile.fat_g} to{' '}
                {preview.fat_g} g - the difference goes on the two macros that
                move on a diet break, split the way your split already leans.
              </div>
            </div>
          )}

          <Button block onClick={startPause} disabled={!kcalValid}>
            {start === today ? 'Pause the diet' : 'Book the pause'}
          </Button>
        </div>
      )}

      {planned.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Booked
          </span>
          {planned.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
            >
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {format(fromLocalDate(p.start), 'd MMM')}
                {p.end ? ` to ${format(fromLocalDate(p.end), 'd MMM')}` : ' onwards'} at{' '}
                {formatKcal(p.kcal)} kcal
              </span>
              <button
                type="button"
                onClick={() => save(removePause(pauses, p.id))}
                className="shrink-0 font-semibold text-destructive"
              >
                Cancel
              </button>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Past breaks
          </span>
          {past.map((p) => (
            <p key={p.id} className="text-xs text-muted-foreground">
              {format(fromLocalDate(p.start), 'd MMM')} to{' '}
              {format(fromLocalDate(p.end as LocalDate), 'd MMM')} at{' '}
              {formatKcal(p.kcal)} kcal/day
            </p>
          ))}
          <p className="text-[11px] text-muted-foreground/70">
            Kept so those days keep being measured against the goal they
            actually had.
          </p>
        </div>
      )}
    </SettingCard>
  );
}
