import { useNavigate } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { aiAvailable } from './aiAvailability';

interface AiFeatureGateProps {
  /** Named in the copy, e.g. "scan nutrition labels". Lower case, verb-first. */
  feature: string;
  /** Rendered when a sync code IS configured. */
  children: React.ReactNode;
}

/**
 * Renders `children` when the AI features are usable, and an in-place
 * explainer with a route to Settings when they are not.
 *
 * The control stays visible rather than being hidden, so the feature is still
 * discoverable - it just explains itself and offers the way to switch it on.
 * See `aiAvailability.ts` for why the check has to happen up front.
 */
export function AiFeatureGate({ feature, children }: AiFeatureGateProps) {
  const navigate = useNavigate();
  if (aiAvailable()) return <>{children}</>;
  return (
    <div className="flex flex-col items-center gap-3 p-8 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
        <Sparkles className="h-6 w-6 text-primary" />
      </div>
      <p className="text-sm text-muted-foreground">
        Connect a sync code to {feature}. It links this device to your account
        so the app can reach the AI service - the same code that syncs your
        diary between devices.
      </p>
      <Button type="button" variant="primary" onClick={() => navigate('/settings')}>
        Go to Settings
      </Button>
    </div>
  );
}
