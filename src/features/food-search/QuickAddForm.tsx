import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';

export interface QuickAddValues {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface QuickAddFormProps {
  initial?: QuickAddValues;
  saveLabel?: string;
  onSave: (values: QuickAddValues) => void;
  onDelete?: () => void;
}

/**
 * Bare calorie entry — log a number without building a food. Macros are
 * optional. Reused for both adding (no `initial`) and editing.
 */
export function QuickAddForm({
  initial,
  saveLabel = 'Add to diary',
  onSave,
  onDelete,
}: QuickAddFormProps) {
  const [kcal, setKcal] = useState(initial ? String(initial.kcal) : '');
  const [protein, setProtein] = useState(initial?.protein ? String(initial.protein) : '');
  const [carbs, setCarbs] = useState(initial?.carbs ? String(initial.carbs) : '');
  const [fat, setFat] = useState(initial?.fat ? String(initial.fat) : '');

  const kcalNum = parseFloat(kcal);
  const valid = Number.isFinite(kcalNum) && kcalNum > 0;

  const handleSave = () => {
    if (!valid) return;
    onSave({
      kcal: kcalNum,
      protein: parseFloat(protein) || 0,
      carbs: parseFloat(carbs) || 0,
      fat: parseFloat(fat) || 0,
    });
  };

  return (
    <div className="flex flex-col">
      <div className="space-y-4 p-4">
        <p className="text-sm text-muted-foreground">
          Log calories directly when you don't want to itemise a meal — eating
          out, a guess, a recipe. Macros are optional.
        </p>
        <LabeledInput
          label="Calories"
          type="number"
          inputMode="decimal"
          step="any"
          min="0"
          value={kcal}
          onChange={(e) => setKcal(e.target.value)}
          autoFocus
          trailing="kcal"
        />
        <div className="grid grid-cols-3 gap-2">
          <LabeledInput
            label="Protein"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            trailing="g"
          />
          <LabeledInput
            label="Carbs"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={carbs}
            onChange={(e) => setCarbs(e.target.value)}
            trailing="g"
          />
          <LabeledInput
            label="Fat"
            type="number"
            inputMode="decimal"
            step="any"
            min="0"
            value={fat}
            onChange={(e) => setFat(e.target.value)}
            trailing="g"
          />
        </div>
      </div>

      <div className="mt-auto flex gap-2 border-t border-border bg-card p-4">
        {onDelete && (
          <Button
            type="button"
            variant="ghost"
            onClick={onDelete}
            className="shrink-0 text-destructive"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        )}
        <Button
          type="button"
          variant="primary"
          block
          disabled={!valid}
          onClick={handleSave}
        >
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
