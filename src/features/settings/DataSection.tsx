import { useRef, useState } from 'react';
import { Download, Upload, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { toast } from '@/components/ui/toast';
import { SettingCard } from './SettingCard';
import { db } from '@/db/dexie';

interface ExportShape {
  version: 1;
  exportedAt: string;
  profiles: unknown[];
  foods: unknown[];
  meals: unknown[];
  meal_items: unknown[];
  diary_entries: unknown[];
  exercise_entries: unknown[];
  weight_log: unknown[];
}

async function exportAll(): Promise<ExportShape> {
  const [profiles, foods, meals, meal_items, diary_entries, exercise_entries, weight_log] =
    await Promise.all([
      db.profiles.toArray(),
      db.foods.toArray(),
      db.meals.toArray(),
      db.meal_items.toArray(),
      db.diary_entries.toArray(),
      db.exercise_entries.toArray(),
      db.weight_log.toArray(),
    ]);
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    profiles,
    foods,
    meals,
    meal_items,
    diary_entries,
    exercise_entries,
    weight_log,
  };
}

export function DataSection() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'export' | 'import' | 'clear' | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);

  const handleExport = async () => {
    setBusy('export');
    try {
      const data = await exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calorie-tracker-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ message: 'Backup downloaded', variant: 'success' });
    } finally {
      setBusy(null);
    }
  };

  const handleImportFile = async (file: File) => {
    setBusy('import');
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ExportShape;
      if (data.version !== 1) throw new Error('Unrecognised backup version');
      await db.transaction(
        'rw',
        [
          db.profiles,
          db.foods,
          db.meals,
          db.meal_items,
          db.diary_entries,
          db.exercise_entries,
          db.weight_log,
        ],
        async () => {
          await Promise.all([
            db.profiles.clear(),
            db.foods.clear(),
            db.meals.clear(),
            db.meal_items.clear(),
            db.diary_entries.clear(),
            db.exercise_entries.clear(),
            db.weight_log.clear(),
          ]);
          if (data.profiles?.length) await db.profiles.bulkPut(data.profiles as never);
          if (data.foods?.length) await db.foods.bulkPut(data.foods as never);
          if (data.meals?.length) await db.meals.bulkPut(data.meals as never);
          if (data.meal_items?.length)
            await db.meal_items.bulkPut(data.meal_items as never);
          if (data.diary_entries?.length)
            await db.diary_entries.bulkPut(data.diary_entries as never);
          if (data.exercise_entries?.length)
            await db.exercise_entries.bulkPut(data.exercise_entries as never);
          if (data.weight_log?.length)
            await db.weight_log.bulkPut(data.weight_log as never);
        },
      );
      toast({ message: 'Backup restored', variant: 'success' });
    } catch (err) {
      toast({
        message: `Restore failed: ${err instanceof Error ? err.message : 'unknown error'}`,
        variant: 'error',
        duration: 6000,
      });
    } finally {
      setBusy(null);
    }
  };

  const doWipe = async () => {
    setConfirmWipe(false);
    setBusy('clear');
    try {
      await db.delete();
      window.location.reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <SettingCard
      title="Data"
      description="Export or restore a full local backup. Cloud sync (above) keeps devices in step; this is for one-off backups."
    >
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={handleExport}
          disabled={busy !== null}
        >
          <Download className="h-4 w-4" />
          Export JSON
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => fileRef.current?.click()}
          disabled={busy !== null}
        >
          <Upload className="h-4 w-4" />
          Import JSON
        </Button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) setPendingImport(file);
          e.target.value = '';
        }}
      />
      <Button
        type="button"
        variant="ghost"
        block
        onClick={() => setConfirmWipe(true)}
        disabled={busy !== null}
        className="text-destructive"
      >
        <Trash2 className="h-4 w-4" />
        Wipe local data
      </Button>

      <ConfirmDialog
        open={pendingImport !== null}
        title="Restore from backup?"
        message="Restoring a backup replaces ALL data currently on this device — diary, meals, products, weight log, and goals. This cannot be undone."
        confirmLabel="Restore"
        onCancel={() => setPendingImport(null)}
        onConfirm={() => {
          const file = pendingImport;
          setPendingImport(null);
          if (file) void handleImportFile(file);
        }}
      />
      <ConfirmDialog
        open={confirmWipe}
        title="Wipe all local data?"
        message="This deletes your diary, meals, products, weight log, and goals on this device. This cannot be undone."
        confirmLabel="Wipe data"
        destructive
        onCancel={() => setConfirmWipe(false)}
        onConfirm={() => void doWipe()}
      />
    </SettingCard>
  );
}
