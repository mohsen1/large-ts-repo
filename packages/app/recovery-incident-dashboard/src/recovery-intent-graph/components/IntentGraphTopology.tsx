import { memo, useMemo } from 'react';
import type {
  IntentPolicy,
  IntentOutput,
  IntentStage,
  PluginContract,
  IntentNodePayload,
  IntentTelemetry,
} from '@domain/recovery-intent-graph';

type IntentGraphTopologyProps = Readonly<{
  readonly policy: IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>;
  readonly telemetry: readonly IntentTelemetry[];
  readonly outputs: readonly IntentOutput[];
  readonly compact?: boolean;
}>;

type StageRow = {
  readonly key: string;
  readonly stage: IntentStage;
  readonly elapsedMs: number;
  readonly score: number;
  readonly recommendations: number;
};

const stageList = ([
  'capture',
  'normalize',
  'score',
  'recommend',
  'simulate',
  'resolve',
] as const) satisfies readonly IntentStage[];

const getTelemetryByIndex = (rows: readonly IntentTelemetry[], index: number): number =>
  rows.at(index)?.elapsedMs ?? 0;

const summarizeRecommendations = (outputs: readonly IntentOutput[]): number =>
  outputs.reduce((acc, output) => acc + output.recommendations.length, 0);

const classifyElapsed = (value: number): 'fast' | 'medium' | 'slow' => {
  if (value < 50) return 'fast';
  if (value < 120) return 'medium';
  return 'slow';
};

export const IntentGraphTopology = memo<IntentGraphTopologyProps>(({ policy, telemetry, outputs, compact = false }) => {
  const rows = useMemo<readonly StageRow[]>(() => {
    const rows = stageList.map((stage, index) => {
      const stageId = `${policy.id}:${stage}:${index}`;
      const score = outputs.at(index)?.score ?? 0;
      const recommendations = outputs.filter((output) => output.recommendations.length > 0).length;
      return {
        key: stageId,
        stage,
        elapsedMs: getTelemetryByIndex(telemetry, index),
        score,
        recommendations,
      };
    });
    return rows;
  }, [policy.id, telemetry, outputs]);

  return (
    <section className={`intent-graph-topology ${compact ? 'compact' : ''}`}>
      <header className="heading">
        <h3>Intent Graph Topology</h3>
        <p>{policy.id}</p>
      </header>

      <dl className="topology-map">
        {rows.map((row) => (
          <div key={row.key} className="topology-row">
            <dt>{row.stage}</dt>
            <dd>
              <strong>{row.score}</strong>
              <small>{row.elapsedMs}ms</small>
              <em className={classifyElapsed(row.elapsedMs)}>{classifyElapsed(row.elapsedMs)}</em>
              <span>{row.recommendations} recommendations</span>
            </dd>
          </div>
        ))}
      </dl>

      <footer className="topology-summary">
        <strong>{policy.steps.length}</strong> stages · <strong>{policy.plugins.length}</strong> plugins ·
        <strong>{summarizeRecommendations(outputs)}</strong> recommendation fragments
      </footer>
    </section>
  );
});

IntentGraphTopology.displayName = 'IntentGraphTopology';
