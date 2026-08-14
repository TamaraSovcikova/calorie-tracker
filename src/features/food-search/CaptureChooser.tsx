import { Barcode, BookOpen, ChevronRight, Camera, ScanText } from 'lucide-react';

/** The four things the camera can be pointed at. */
export type CaptureKind = 'barcode' | 'label' | 'meal' | 'recipe';

interface CaptureOption {
  kind: CaptureKind;
  icon: typeof Barcode;
  title: string;
  /** When to reach for this one. */
  when: string;
  /** Where you end up. Named because recipe goes somewhere different. */
  destination?: string;
}

const OPTIONS: CaptureOption[] = [
  {
    kind: 'barcode',
    icon: Barcode,
    title: 'Barcode',
    when: 'A packaged product',
  },
  {
    kind: 'label',
    icon: ScanText,
    title: 'Nutrition label',
    when: 'The back of a pack, when the barcode is unknown',
  },
  {
    kind: 'meal',
    icon: Camera,
    title: 'Meal photo',
    when: 'A plate of food - AI names the items and estimates portions',
  },
  {
    kind: 'recipe',
    icon: BookOpen,
    title: 'Recipe',
    when: 'A recipe page or screenshot',
    // Barcode, label and meal all end up logged to the section you opened.
    // This one does not, and saying so beats surprising someone mid-log.
    destination: 'Saves a reusable meal instead of logging now',
  },
];

/**
 * One door for every camera capability.
 *
 * These used to be scattered: barcode in a tab, the label buried behind a
 * text link inside the barcode scanner, meal photo in another tab, recipe on
 * a different page entirely. Two of the four were effectively undiscoverable,
 * and nothing anywhere said what each was for.
 */
export function CaptureChooser({
  onPick,
  omit = [],
}: {
  onPick: (kind: CaptureKind) => void;
  /** Kinds that make no sense in this context. */
  omit?: CaptureKind[];
}) {
  const options = OPTIONS.filter((o) => !omit.includes(o.kind));
  return (
    <ul className="divide-y divide-border">
      {options.map(({ kind, icon: Icon, title, when, destination }) => (
        <li key={kind}>
          <button
            type="button"
            onClick={() => onPick(kind)}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
              <Icon className="h-[18px] w-[18px] text-primary" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{title}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {when}
              </span>
              {destination && (
                <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                  {destination}
                </span>
              )}
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </li>
      ))}
    </ul>
  );
}
