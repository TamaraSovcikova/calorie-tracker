import { useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { copyDayEntries } from '@/db/repos/diary';
import { formatDayHeader, shiftDate, type LocalDate } from '@/lib/dates';

interface CopyDaySheetProps {
  open: boolean;
  fromDate: LocalDate;
  onClose: () => void;
}

/**
 * "Copy this day's entries to another date" — for repeating a routine
 * day. The source day is never modified; entries are duplicated onto the
 * target date.
 */
export function CopyDaySheet({ open, fromDate, onClose }: CopyDaySheetProps) {
  const [target, setTarget] = useState<LocalDate>(() => shiftDate(fromDate, 1));
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleCopy = async () => {
    setResult(null);
    if (target === fromDate) {
      setResult('Pick a different date.');
      return;
    }
    setBusy(true);
    try {
      const n = await copyDayEntries(fromDate, target);
      if (n === 0) {
        setResult('Nothing to copy — the source day has no entries.');
      } else {
        setResult(
          `Copied ${n} ${n === 1 ? 'entry' : 'entries'} to ${formatDayHeader(target)}.`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Copy day"
      fullScreenMobile={false}
    >
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Copy every food and meal logged on{' '}
          <span className="font-medium text-foreground">
            {formatDayHeader(fromDate)}
          </span>{' '}
          ({fromDate}) onto another date. The original day is left as-is.
        </p>
        <LabeledInput
          label="Copy to date"
          type="date"
          value={target}
          onChange={(e) => {
            setTarget(e.target.value as LocalDate);
            setResult(null);
          }}
        />
        {result && (
          <p className="text-sm text-muted-foreground">{result}</p>
        )}
        <Button
          type="button"
          variant="primary"
          block
          onClick={handleCopy}
          disabled={busy || !target}
        >
          <CalendarPlus className="h-4 w-4" />
          {busy ? 'Copying…' : 'Copy entries'}
        </Button>
      </div>
    </Sheet>
  );
}
