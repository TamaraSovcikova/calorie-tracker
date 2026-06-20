import { SettingCard } from './SettingCard';

export function AboutSection() {
  return (
    <SettingCard title="About">
      <div className="grid grid-cols-2 gap-y-2 text-sm">
        <div className="text-muted-foreground">App</div>
        <div className="text-right font-medium" style={{ color: 'var(--color-accent)' }}>Verve</div>
        <div className="text-muted-foreground">Version</div>
        <div className="text-right tabular-nums">{__APP_VERSION__}</div>
        <div className="text-muted-foreground">Cloud sync</div>
        <div className="text-right">Cloudflare Workers + D1</div>
        <div className="text-muted-foreground">Activity</div>
        <div className="text-right">Google Health API</div>
        <div className="text-muted-foreground">Food data</div>
        <div className="text-right">Curated · USDA · OFF</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Open Food Facts product database is licensed under ODbL.
      </p>
    </SettingCard>
  );
}
