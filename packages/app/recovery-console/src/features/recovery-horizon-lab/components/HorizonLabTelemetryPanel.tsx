import { memo } from 'react';
import { useHorizonLabTimeline } from '../hooks/useHorizonLabTimeline';
import type { EngineRunSummary } from '@service/recovery-stress-lab-orchestrator/src/horizon-execution-engine';

interface HorizonLabTelemetryPanelProps {
  readonly summary: EngineRunSummary | null;
}

interface MetricLine {
  readonly label: string;
  readonly value: string;
}

const MetricRow = ({ line }: { readonly line: MetricLine }) => {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: 8,
      marginBottom: 8,
      borderBottom: '1px solid #e4ebf2',
      paddingBottom: 4,
    }}>
      <span style={{ color: '#5b6b7a' }}>{line.label}</span>
      <span style={{ color: '#0c1f33', fontWeight: 600 }}>{line.value}</span>
    </div>
  );
};

export const HorizonLabTelemetryPanel = memo(({ summary }: HorizonLabTelemetryPanelProps) => {
  const timeline = useHorizonLabTimeline(summary);

  const metrics: MetricLine[] = [
    { label: 'Route', value: summary?.state.route ?? 'pending' },
    { label: 'Timeline entries', value: String(summary?.timeline.length ?? 0) },
    { label: 'Snapshots', value: String(summary?.snapshots.length ?? 0) },
    { label: 'Total duration', value: `${timeline.totalDurationMs}ms` },
    { label: 'First stage', value: summary?.timeline.at(0)?.stage ?? 'n/a' },
    { label: 'Last stage', value: summary?.timeline.at(-1)?.stage ?? 'n/a' },
    { label: 'Run id', value: summary?.state.runId ?? 'none' },
  ];

  return (
    <aside
      style={{
        padding: 16,
        border: '1px solid #dde4ee',
        borderRadius: 12,
        background: '#f5f9ff',
      }}
    >
      <h3>Horizon Telemetry</h3>
      {metrics.map((line) => (
        <MetricRow key={line.label} line={line} />
      ))}

      <div style={{ marginTop: 16 }}>
        <h4>Stage heatmap</h4>
        {timeline.buckets.map((bucket) => {
          const width = Math.max(12, Math.min(360, bucket.value * 4));
          return (
            <div key={bucket.name} style={{ marginBottom: 10 }}>
              <div style={{ marginBottom: 4 }}>{bucket.name}</div>
              <div
                style={{
                  width: `${width}px`,
                  height: 8,
                  background: 'linear-gradient(90deg, #3f72f1, #5ea4ff)',
                  borderRadius: 6,
                }}
              />
            </div>
          );
        })}
      </div>
    </aside>
  );
});
