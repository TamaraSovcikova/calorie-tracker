import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { CalendarPlus, ChevronLeft, Search, Trash2, Utensils } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Sheet } from '@/components/ui/Sheet';
import { toast } from '@/components/ui/toast';
import { formatKcal } from '@/lib/macros';
import { fromLocalDate, shiftDate, todayLocal, type LocalDate } from '@/lib/dates';
import { useProfile } from '@/db/repos/profile';
import {
  createReservation,
  deleteReservation,
  useReservations,
} from '@/db/repos/reservations';
import { goalResolver } from '@/features/diet-pause/dietPause';
import { scheduleFor } from './dailyGoal';
import {
  FUND_MODE_LABELS,
  MAX_SPREAD_DAYS,
  previewReservation,
  type FundMode,
} from './reservations';
import { ReserveItemPicker, type PickedItem } from './ReserveItemPicker';
import { isLoggable } from './logReserved';
import type { Reservation } from '@/db/types';

/** Rough sizes for things people actually reserve for. Estimates, and said
 *  to be estimates - a made-up number presented as fact is worse than a
 *  blank field. */
const PRESETS: [string, number][] = [
  ['Slice of cake', 450],
  ['A few drinks', 600],
  ['Restaurant meal', 900],
  ['Takeaway', 1200],
];

const SPREADS = [3, 5, 7, 14];

function ReserveForm({ onDone }: { onDone: () => void }) {
  const profile = useProfile();
  const existing = useReservations();
  const today = todayLocal();

  const [label, setLabel] = useState('');
  const [kcal, setKcal] = useState('');
  const [date, setDate] = useState<LocalDate>(shiftDate(today, 7));
  const [fundMode, setFundMode] = useState<FundMode>('before');
  const [spread, setSpread] = useState(7);
  const [picking, setPicking] = useState(false);
  // Set when the amount came from a real food or meal, so the reservation
  // can be logged with one tap on the day instead of retyped.
  const [picked, setPicked] = useState<PickedItem | null>(null);

  const kcalNum = parseFloat(kcal);
  const valid = Number.isFinite(kcalNum) && kcalNum > 0 && date >= today;

  const preview = useMemo(() => {
    if (!profile || !valid) return null;
    return previewReservation(
      { date, kcal: kcalNum, fund_mode: fundMode, spread_days: spread },
      today,
      existing ?? [],
      goalResolver(profile),
      profile.budget_max_daily_trim,
    );
  }, [profile, existing, valid, date, kcalNum, fundMode, spread, today]);

  const save = async () => {
    if (!valid) return;
    await createReservation({
      date,
      kcal: Math.round(kcalNum),
      label: label.trim() || 'Reserved calories',
      fund_mode: fundMode,
      spread_days: spread,
      // Only carried when the amount still matches what was picked - editing
      // the number by hand means it is no longer that portion of that food.
      ...(picked && Math.round(picked.kcal) === Math.round(kcalNum)
        ? {
            food_id: picked.food_id,
            meal_id: picked.meal_id,
            qty: picked.qty,
            unit: picked.unit,
          }
        : {}),
    });
    toast({ message: 'Reserved', variant: 'success' });
    onDone();
  };

  return (
    <div className="space-y-4 px-4 py-4">
      <LabeledInput
        label="What for"
        placeholder="Birthday cake"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />

      <LabeledInput
        label="How much"
        type="number"
        inputMode="numeric"
        step="any"
        min="0"
        value={kcal}
        onChange={(e) => setKcal(e.target.value)}
        trailing="kcal"
      />
      {/* Picking the real thing beats guessing at it, and it is what lets
          the day itself offer to log it. */}
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2.5 text-left text-sm hover:bg-muted"
      >
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="flex-1">Pick the actual food or meal</span>
      </button>

      {picked && Math.round(picked.kcal) === Math.round(kcalNum) && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
          <Utensils className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
          <span className="text-muted-foreground">
            <span className="font-medium text-foreground">{picked.label}</span> at{' '}
            {formatKcal(picked.kcal)} kcal. On the day you can log it in one tap.
          </span>
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map(([name, n]) => (
          <button
            key={name}
            type="button"
            onClick={() => {
              setKcal(String(n));
              setPicked(null);
              if (!label.trim()) setLabel(name);
            }}
            className="rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            {name} ~{n}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground/70">
        Those are rough estimates. Pick the real food above, or type the number
        when you know it.
      </p>

      <ReserveItemPicker
        open={picking}
        onClose={() => setPicking(false)}
        onPick={(item) => {
          setPicked(item);
          setKcal(String(Math.round(item.kcal)));
          if (!label.trim()) setLabel(item.label);
        }}
      />

      <LabeledInput
        label="Which day"
        type="date"
        min={today}
        value={date}
        onChange={(e) => {
          if (e.target.value) setDate(e.target.value as LocalDate);
        }}
      />

      <div className="space-y-1">
        <SegmentedControl<FundMode>
          label="Where it comes from"
          variant="solid"
          value={fundMode}
          onChange={setFundMode}
          options={[
            { value: 'before', label: 'Before' },
            { value: 'after', label: 'After' },
            { value: 'split', label: 'Split' },
          ]}
        />
        <p className="text-xs text-muted-foreground">
          {FUND_MODE_LABELS[fundMode]}.
        </p>
      </div>

      <div className="space-y-1">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Spread over
        </span>
        <div className="flex flex-wrap gap-1.5">
          {SPREADS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setSpread(Math.min(n, MAX_SPREAD_DAYS))}
              className={
                spread === n
                  ? 'rounded-full border border-primary bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground'
                  : 'rounded-full border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-muted'
              }
            >
              {n} days
            </button>
          ))}
        </div>
      </div>

      {/* The whole decision in one box: what it costs a day, and whether the
          window can actually carry it. Shown before anything is saved. */}
      {preview && (
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs">
          {preview.funded >= 1 ? (
            <>
              <div className="font-medium text-foreground">
                {formatKcal(preview.evenPerDay)} kcal off each of{' '}
                {preview.days.length} day{preview.days.length === 1 ? '' : 's'}.
              </div>
              <div className="mt-1 text-muted-foreground">
                {format(fromLocalDate(preview.days[0]), 'EEE d MMM')} to{' '}
                {format(
                  fromLocalDate(preview.days[preview.days.length - 1]),
                  'EEE d MMM',
                )}
                . Those days count as on target at the lower number, so nothing
                reads as under-eating and the week's budget does not move.
              </div>
            </>
          ) : (
            <div className="font-medium text-foreground">
              Nothing can be set aside for this yet.
            </div>
          )}

          {preview.shortfall >= 1 && (
            <div className="mt-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2.5 py-2 text-amber-700 dark:text-amber-300">
              {preview.reason === 'no-days'
                ? 'There are no days to fund this from. Move the day later, or fund it from the days after instead.'
                : `Only ${formatKcal(preview.funded)} of ${formatKcal(kcalNum)} fits without taking a day too low. Spread it wider, split it either side, or reserve less.`}
            </div>
          )}
        </div>
      )}

      <Button block onClick={() => void save()} disabled={!valid}>
        Reserve {valid ? formatKcal(kcalNum) : ''} kcal
      </Button>
    </div>
  );
}

function ReservationRow({
  reservation,
  perDay,
  days,
  funded,
  shortfall,
  onDelete,
}: {
  reservation: Reservation;
  perDay: number;
  days: number;
  funded: number;
  shortfall: number;
  onDelete: () => void;
}) {
  const past = reservation.date < todayLocal();
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-sm font-semibold">{reservation.label}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {format(fromLocalDate(reservation.date), 'EEE d MMM')}
          </span>
        </div>
        <div className="mt-0.5 text-sm tabular-nums">
          {formatKcal(funded)} kcal
          {shortfall >= 1 && (
            <span className="text-muted-foreground">
              {' '}
              of {formatKcal(reservation.kcal)} asked for
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground">
          {days > 0
            ? `${formatKcal(perDay)} kcal off each of ${days} day${days === 1 ? '' : 's'}${past ? ', done' : ''}.`
            : 'No days could fund this.'}
        </div>
        {isLoggable(reservation) && (
          <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground/70">
            <Utensils className="h-3 w-3 shrink-0" />
            One tap to log it on the day.
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete ${reservation.label}`}
        className="tap-target shrink-0 rounded-md p-2 text-muted-foreground hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * Reserve calories for a day. Deliberately its own route rather than a fifth
 * bottom-nav tab: four tabs is already full, and the entry points (the diary
 * pill, the overflow menu, the breakdown sheet) do the discovery instead.
 */
export function ReservePage() {
  const navigate = useNavigate();
  const profile = useProfile();
  const reservations = useReservations();
  const [adding, setAdding] = useState(false);
  const today = todayLocal();

  const schedule = useMemo(
    () => scheduleFor(reservations ?? [], profile),
    [reservations, profile],
  );

  const upcoming = (reservations ?? []).filter((r) => r.date >= today);
  const past = (reservations ?? []).filter((r) => r.date < today).slice(-5).reverse();

  const remove = async (r: Reservation) => {
    await deleteReservation(r.id);
    toast({ message: `${r.label} removed`, variant: 'success' });
  };

  const row = (r: Reservation) => {
    const plan = schedule.byId.get(r.id);
    return (
      <ReservationRow
        key={r.id}
        reservation={r}
        perDay={plan?.evenPerDay ?? 0}
        days={plan?.days.length ?? 0}
        funded={plan?.funded ?? 0}
        shortfall={plan?.shortfall ?? 0}
        onDelete={() => void remove(r)}
      />
    );
  };

  return (
    <>
      <div className="mx-auto max-w-md px-4 pt-6">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/diary')}
            aria-label="Back"
            className="tap-target rounded-md p-2"
            style={{ color: 'var(--color-text-faint)' }}
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <h1 className="flex-1 text-title">Reserved calories</h1>
        </div>
        <p className="mt-2 px-2 text-xs text-muted-foreground">
          Set calories aside for a day, paid for by the days around it. Nothing
          is created or lost: what one day gains, the others give up, so your
          week's total stays exactly where it was.
        </p>
      </div>

      <div className="mx-auto max-w-md animate-fade-in space-y-3 px-4 py-4 pb-8">
        <Button block onClick={() => setAdding(true)}>
          <CalendarPlus className="h-4 w-4" />
          Reserve calories
        </Button>

        {reservations === undefined ? null : upcoming.length === 0 &&
          past.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Nothing reserved. Pick a day you want room on and the days around it
            will make space for it.
          </div>
        ) : null}

        {upcoming.length > 0 && (
          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Coming up
            </div>
            {upcoming.map(row)}
          </div>
        )}

        {past.length > 0 && (
          <div className="space-y-2">
            <div className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Past
            </div>
            {past.map(row)}
            <p className="px-1 text-[11px] text-muted-foreground/70">
              Kept so the days that funded them keep being measured against the
              goal they actually had.
            </p>
          </div>
        )}
      </div>

      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="Reserve calories"
      >
        <ReserveForm onDone={() => setAdding(false)} />
      </Sheet>
    </>
  );
}
