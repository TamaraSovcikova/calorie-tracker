import { SettingCard } from './SettingCard';

const VERSION = '0.0.1';

export function AboutSection() {
  return (
    <SettingCard title="About">
      <div className="grid grid-cols-2 gap-y-2 text-sm">
        <div className="text-muted-foreground">Version</div>
        <div className="text-right tabular-nums">{VERSION}</div>
        <div className="text-muted-foreground">Cloud sync</div>
        <div className="text-right">Coming in Phase 11</div>
        <div className="text-muted-foreground">Fitbit</div>
        <div className="text-right">Coming in Phase 12</div>
      </div>
      <p className="text-xs text-muted-foreground">
        Open Food Facts product database is licensed under ODbL.
      </p>
    </SettingCard>
  );
}
