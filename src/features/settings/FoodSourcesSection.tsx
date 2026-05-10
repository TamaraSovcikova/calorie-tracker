import { useEffect, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { LabeledInput } from '@/components/ui/Input';
import { Switch } from '@/components/ui/Switch';
import { SettingCard } from './SettingCard';
import {
  getUsdaApiKey,
  setUsdaApiKey,
  probeUsdaKey,
} from '@/lib/usda-api';
import {
  getShowPackaged,
  notifyFoodSourceChanged,
  setShowPackaged,
} from './foodSourceSettings';

type ProbeStatus = 'idle' | 'testing' | 'ok' | 'bad' | 'error';

export function FoodSourcesSection() {
  const [draftKey, setDraftKey] = useState(() => getUsdaApiKey() ?? '');
  const [savedKey, setSavedKey] = useState(() => getUsdaApiKey() ?? '');
  const [showPackaged, setShowPackagedState] = useState(getShowPackaged);
  const [probe, setProbe] = useState<ProbeStatus>('idle');
  const [probeMessage, setProbeMessage] = useState<string | null>(null);

  // Whenever the saved key changes, refresh the search hooks.
  useEffect(() => {
    notifyFoodSourceChanged();
  }, [savedKey, showPackaged]);

  const dirty = draftKey.trim() !== savedKey.trim();

  const handleSave = async () => {
    const next = draftKey.trim();
    setProbe('testing');
    setProbeMessage(null);
    if (!next) {
      setUsdaApiKey(null);
      setSavedKey('');
      setProbe('idle');
      notifyFoodSourceChanged();
      return;
    }
    try {
      const ok = await probeUsdaKey(next);
      if (!ok) {
        setProbe('bad');
        setProbeMessage('USDA rejected the key (401/403).');
        return;
      }
      setUsdaApiKey(next);
      setSavedKey(next);
      setProbe('ok');
      setProbeMessage('Key works — searches now include USDA results.');
      notifyFoodSourceChanged();
    } catch (err) {
      setProbe('error');
      setProbeMessage(
        err instanceof Error
          ? `Network error: ${err.message}`
          : 'Network error reaching USDA.',
      );
    }
  };

  const handleTogglePackaged = (next: boolean) => {
    setShowPackagedState(next);
    setShowPackaged(next);
  };

  return (
    <SettingCard
      title="Food sources"
      description="Where the search box looks. USDA needs a free API key; Open Food Facts works without."
    >
      <LabeledInput
        label="USDA FoodData Central API key"
        type="password"
        placeholder={savedKey ? '•••••••• (saved)' : 'Paste your key'}
        value={draftKey}
        onChange={(e) => {
          setDraftKey(e.target.value);
          setProbe('idle');
          setProbeMessage(null);
        }}
        autoComplete="off"
        spellCheck={false}
      />
      <div className="flex items-center justify-between gap-2">
        <a
          href="https://api.data.gov/signup/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Get a free key
          <ExternalLink className="h-3 w-3" />
        </a>
        <Button
          size="sm"
          variant={dirty ? 'primary' : 'secondary'}
          onClick={handleSave}
          disabled={probe === 'testing'}
        >
          {probe === 'testing' ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Testing
            </>
          ) : dirty ? (
            'Save & test'
          ) : (
            'Test key'
          )}
        </Button>
      </div>
      {probeMessage && (
        <p
          className={
            probe === 'ok'
              ? 'flex items-center gap-1.5 text-xs text-primary'
              : 'flex items-center gap-1.5 text-xs text-destructive'
          }
        >
          {probe === 'ok' ? (
            <CheckCircle2 className="h-3.5 w-3.5" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5" />
          )}
          {probeMessage}
        </p>
      )}

      <div className="border-t border-border pt-3">
        <Switch
          label="Show packaged products in search"
          description="When off, the search shows only USDA generic foods + your saved products. Barcode scans still work."
          checked={showPackaged}
          onChange={handleTogglePackaged}
        />
      </div>
    </SettingCard>
  );
}
