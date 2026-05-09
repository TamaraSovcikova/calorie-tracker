import { Lock } from 'lucide-react';
import { useFeature } from './useFeature';
import type { FeatureKey } from './featureFlags';

interface PremiumLockProps {
  feature: FeatureKey;
  /** Inline label e.g. the name of the locked feature. */
  label: string;
}

/**
 * Small "Pro" pill / overlay used to mark gated features in the UI without
 * blocking layout. Render alongside or instead of the locked control.
 */
export function PremiumLock({ feature, label }: PremiumLockProps) {
  const { enabled, required } = useFeature(feature);
  if (enabled) return null;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
      <Lock className="h-3 w-3" />
      {label} · {required.toUpperCase()}
    </div>
  );
}
