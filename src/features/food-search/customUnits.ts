import type { CustomUnit } from '@/db/types';

/**
 * Reading a custom unit off the two "name / grams" fields.
 *
 * "Add unit" used to fail in silence. Each of these returned without a word:
 * a decimal comma ("37,5", which is what a Belgian phone keyboard types),
 * an empty field, a name already in use. From the outside that is a button
 * that sometimes does nothing. Every failure now comes back as a sentence.
 */
export type UnitDraft =
  | { unit: CustomUnit; error?: undefined }
  | { unit?: undefined; error: string }
  /** Both fields empty: nothing was being added. */
  | { unit?: undefined; error?: undefined };

export function readUnitDraft(
  label: string,
  gramsText: string,
  existing: CustomUnit[],
): UnitDraft {
  const name = label.trim();
  const text = gramsText.trim();
  if (!name && !text) return {};
  if (!name) return { error: 'Give the unit a name, like "scoop".' };
  if (!text) return { error: `How many grams is one ${name}?` };
  const grams = parseFloat(text.replace(',', '.'));
  if (!Number.isFinite(grams) || grams <= 0) {
    return { error: 'Grams has to be a number above 0.' };
  }
  if (sameLabel(existing, name)) {
    return { error: `There is already a unit called "${name}".` };
  }
  return { unit: { label: name, grams } };
}

const sameLabel = (units: CustomUnit[], label: string) =>
  units.some((u) => u.label.trim().toLowerCase() === label.trim().toLowerCase());

/**
 * `base` plus any unit of `extra` it does not already have, by name.
 * Used wherever two lists of units meet, so one never wipes the other:
 * a stale copy of the food held by a screen, or the built-in list being
 * refreshed over units the user added.
 */
export function mergeUnits(base: CustomUnit[], extra: CustomUnit[]): CustomUnit[] {
  const out = [...base];
  for (const u of extra) if (!sameLabel(out, u.label)) out.push(u);
  return out;
}
