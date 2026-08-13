/**
 * Whether the AI features can run at all.
 *
 * The four AI features (label scan, photo log, recipe scan, meal planner) all
 * call the Worker, which needs a sync code. Until this existed none of them
 * checked: the user opened a camera, granted permission, framed a nutrition
 * label, took the shot, waited for the upload, and only THEN got told the
 * feature was never available. The check ran at the end instead of the start.
 *
 * Kept apart from AiFeatureGate.tsx so that file exports only components
 * (react-refresh wants one or the other, not both).
 */

import { isConfigured } from '@/db/sync/config';

/** Not reactive: the sync code lives in localStorage and only changes on the
 *  Settings screen, which unmounts these surfaces anyway. */
export function aiAvailable(): boolean {
  return isConfigured();
}

/**
 * Reason to show instead of firing an AI action, or null when it can proceed.
 * `feature` is named in the copy, e.g. "scan nutrition labels" - lower case,
 * verb-first.
 */
export function aiUnavailableReason(feature: string): string | null {
  return aiAvailable() ? null : `Connect a sync code in Settings to ${feature}.`;
}
