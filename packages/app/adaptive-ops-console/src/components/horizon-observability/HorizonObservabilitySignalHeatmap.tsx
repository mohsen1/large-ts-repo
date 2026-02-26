import type { PluginStage } from '@domain/recovery-horizon-engine';
import type { ObservatorySignalRecord } from '@domain/recovery-horizon-observability';

interface HorizonObservabilitySignalHeatmapProps {
  readonly tenantId: string;
  readonly signals: readonly ObservatorySignalRecord[];
  readonly selected: readonly PluginStage[];
  readonly onSelect: (stage: PluginStage) => void;
}

const buildCell = (count: number, hasSignal: boolean) => {
  const hue = hasSignal ? Math.max(0, 120 - count * 15) : 0;
  return {
    background: hasSignal ? `hsl(${hue} 60% 45%)` : 'rgba(0,0,0,0.15)',
    width: `${Math.max(18, Math.min(44, count * 6 + 18))}px`,
    height: `${Math.max(18, Math.min(44, count * 6 + 18))}px`,
    fontSize: `${Math.max(10, Math.min(16, count + 8))}px`,
  };
};

const toBuckets = (signals: readonly ObservatorySignalRecord[]) => {
  const buckets: Record<PluginStage, number> = {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  };

  for (const signal of signals) {
    buckets[signal.stage] += 1;
  }
  return buckets;
};

export const HorizonObservabilitySignalHeatmap = ({
  tenantId,
  signals,
  selected,
  onSelect,
}: HorizonObservabilitySignalHeatmapProps) => {
  const buckets = toBuckets(signals);
  const total = signals.length;
  const stageList = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const satisfies readonly PluginStage[];

  return (
    <section className="horizon-observability-heatmap">
      <h4>Signal heatmap for {tenantId}</h4>
      <div className="heatmap-row">
        <span>Total events: {total}</span>
        <span>Selected: {selected.join(', ') || 'none'}</span>
      </div>
      <div className="heatmap-grid">
        {stageList.map((stage) => {
          const count = buckets[stage];
          const isSelected = selected.includes(stage);
          const style = buildCell(count, count > 0);
          return (
            <button
              type="button"
              key={stage}
              onClick={() => onSelect(stage)}
              className={isSelected ? 'selected' : undefined}
              style={style}
              title={`${stage}: ${count}`}
            >
              {stage}
            </button>
          );
        })}
      </div>
    </section>
  );
};
