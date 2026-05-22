import { useState } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { toast } from '@/components/ui/toast';
import { renamePet } from '@/db/repos/pet';
import { pulseReaction } from './petReaction';

interface RenamePetSheetProps {
  open: boolean;
  currentName: string;
  onClose: () => void;
}

/** Rename the dog — opened from the tappable name on the Pet screen. */
export function RenamePetSheet({ open, currentName, onClose }: RenamePetSheetProps) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Rename your dog"
      fullScreenMobile={false}
    >
      <RenameForm currentName={currentName} onClose={onClose} />
    </Sheet>
  );
}

function RenameForm({
  currentName,
  onClose,
}: {
  currentName: string;
  onClose: () => void;
}) {
  const [name, setName] = useState(currentName);

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    await renamePet(trimmed);
    pulseReaction('love', 3000);
    toast({ message: `Your dog is now ${trimmed}`, variant: 'success' });
    onClose();
  };

  return (
    <div className="space-y-4 p-4">
      <LabeledInput
        label="Dog's name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <Button
        type="button"
        variant="primary"
        block
        disabled={!name.trim()}
        onClick={() => void save()}
      >
        Save
      </Button>
    </div>
  );
}
