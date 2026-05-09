/**
 * Internal storage is always metric. Imperial is presentation-only.
 */

export type UnitSystem = 'metric' | 'imperial';

export const KG_PER_LB = 0.45359237;
export const CM_PER_IN = 2.54;
export const G_PER_OZ = 28.3495;
export const ML_PER_FLOZ = 29.5735;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

export function gToOz(g: number): number {
  return g / G_PER_OZ;
}

export function ozToG(oz: number): number {
  return oz * G_PER_OZ;
}

export function formatWeight(kg: number, system: UnitSystem): string {
  if (system === 'imperial') return `${kgToLb(kg).toFixed(1)} lb`;
  return `${kg.toFixed(1)} kg`;
}

export function formatHeight(cm: number, system: UnitSystem): string {
  if (system === 'imperial') {
    const totalIn = cmToIn(cm);
    const ft = Math.floor(totalIn / 12);
    const inches = Math.round(totalIn - ft * 12);
    return `${ft}'${inches}"`;
  }
  return `${Math.round(cm)} cm`;
}
