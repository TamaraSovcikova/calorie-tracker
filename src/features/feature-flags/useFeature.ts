import { useProfile } from '@/db/repos/profile';
import {
  FEATURE_PLAN,
  profileAllows,
  type FeatureKey,
  type Plan,
} from './featureFlags';

export interface FeatureStatus {
  /** True when the current profile'\''s plan is at or above the feature'\''s required plan. */
  enabled: boolean;
  /** Plan the feature requires. */
  required: Plan;
  /** Current plan from profile (defaults to '\''free'\'' before profile loads). */
  current: Plan;
}

/**
 * Hook returning a feature's gate status.
 *
 * Usage in a UI:
 *   const { enabled } = useFeature('aiPhotoLog');
 *   if (!enabled) return <PremiumLock feature="aiPhotoLog" />;
 */
export function useFeature(key: FeatureKey): FeatureStatus {
  const profile = useProfile();
  return {
    enabled: profileAllows(profile, key),
    required: FEATURE_PLAN[key],
    current: profile?.plan ?? 'free',
  };
}
