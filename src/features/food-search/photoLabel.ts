/**
 * AI nutrition-label scan — send a label photo to the Worker and get back
 * transcribed per-100g values to prefill the manual food form. Never throws.
 *
 * Unlike the meal planner / photo log, the numbers here ARE the answer: the
 * model transcribes printed label values rather than estimating. They still
 * land in the editable form for the user to confirm before saving.
 */

import { getSyncConfig, syncBaseUrl } from '@/db/sync/config';
import { downscaleImage } from '@/features/photo-log/photoLog';

export interface ScannedLabel {
  name: string;
  brand: string;
  kcal_100: number;
  protein_100: number;
  carbs_100: number;
  fat_100: number;
  fiber_100: number | null;
  sugar_100: number | null;
  sodium_100: number | null;
  serving_g: number | null;
}

export interface LabelScanResult {
  label: ScannedLabel | null;
  error?: string;
}

export async function analyzeLabel(file: Blob): Promise<LabelScanResult> {
  const { token } = getSyncConfig();
  if (!token) {
    return {
      label: null,
      error: 'Connect a sync code in Settings to scan labels.',
    };
  }
  const body = await downscaleImage(file);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(`${syncBaseUrl()}/api/photo-label`, {
      method: 'POST',
      headers: {
        'content-type': 'image/jpeg',
        authorization: `Bearer ${token}`,
      },
      body,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => null)) as LabelScanResult | null;
    if (!data) return { label: null, error: 'No response — try again.' };
    return { label: data.label ?? null, error: data.error };
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === 'AbortError';
    return {
      label: null,
      error: aborted
        ? 'Scan took too long — try again.'
        : 'Could not reach the label scanner.',
    };
  } finally {
    clearTimeout(timeout);
  }
}
