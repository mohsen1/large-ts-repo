import { useMemo } from 'react';
import {
  type QuantumPluginMetric,
  type QuantumExecutionResult,
  type QuantumTelemetryPoint,
  type QuantumTimelineEvent,
  type QuantumRunState,
} from '../types';

interface QuantumOrchestrationControlPanelProps {
  readonly tenant: string;
  readonly runState: QuantumRunState;
  readonly timeline: readonly QuantumTimelineEvent[];
  readonly pluginMetrics: readonly QuantumPluginMetric[];
  readonly telemetry: readonly QuantumTelemetryPoint[];
  readonly result: QuantumExecutionResult | null;
  readonly runError: string | null;
  readonly onRun: () => Promise<void>;
}

const maxLength = (items: readonly unknown[], fallback = 7): number => Math.min(items.length, fallback);

const countByHealth = (metrics: readonly QuantumPluginMetric[]) =>
  metrics.reduce<Record<string, number>>((acc, metric) => {
    acc[metric.health] = (acc[metric.health] ?? 0) + 1;
    return acc;
  }, {});

const eventRate = (timeline: readonly QuantumTimelineEvent[]): number => {
  const elapsed = timeline.length === 0 ? 0 : timeline[timeline.length - 1]!.index + 1;
  if (elapsed === 0) {
    return 0;
  }
  return timeline.reduce((sum) => sum + 1, 0) / Math.max(1, elapsed);
};

export const QuantumOrchestrationControlPanel = ({
  tenant,
  runState,
  timeline,
  pluginMetrics,
  telemetry,
  result,
  runError,
  onRun,
}: QuantumOrchestrationControlPanelProps) => {
  const counts = useMemo(() => countByHealth(pluginMetrics), [pluginMetrics]);
  const telemetryPulse = useMemo(() => telemetry.slice(-maxLength(telemetry)), [telemetry]);
  const timelinePulse = useMemo(() => timeline.slice(-maxLength(timeline)), [timeline]);

  const summaryLine =
    runState === 'complete'
      ? `run ${result?.runId ?? 'n/a'} complete (${result?.pluginCount ?? 0} plugins)`
      : `run state ${runState} for ${tenant}`;

  return (
    <section style={{ border: '1px solid #ddd', padding: 12, borderRadius: 10, marginBottom: 16 }}>
      <h2>Quantum orchestration control</h2>
      <p>{summaryLine}</p>
      {runError ? <p style={{ color: 'red' }}>{runError}</p> : null}
      <button
        type="button"
        style={{ marginBottom: 10 }}
        onClick={() => {
          void onRun();
        }}
      >
        Run quantum orchestration
      </button>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <h3>Run health</h3>
          <ul>
            <li>{`timeline events: ${timeline.length}`}</li>
            <li>{`telemetry points: ${telemetry.length}`}</li>
            <li>{`event throughput: ${eventRate(timeline).toFixed(3)}`}</li>
            <li>{`warn: ${counts.warn ?? 0}`}</li>
            <li>{`info: ${counts.info ?? 0}`}</li>
            <li>{`critical: ${counts.critical ?? 0}`}</li>
          </ul>
        </div>
        <div>
          <h3>Latest telemetry</h3>
          <ul>
            {telemetryPulse.map((point) => (
              <li key={`${point.at}-${point.key}`}>
                <strong>{point.key}</strong> {point.value}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <h3>Timeline</h3>
      <ul>
        {timelinePulse.map((entry) => (
          <li key={`${entry.at}-${entry.index}`}>
            {entry.stage} · {entry.nodeId} · {entry.detail}
          </li>
        ))}
      </ul>
    </section>
  );
};
