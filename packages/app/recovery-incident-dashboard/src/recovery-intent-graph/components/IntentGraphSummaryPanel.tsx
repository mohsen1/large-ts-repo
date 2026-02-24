import { memo } from 'react';
import type {
  IntentGraphId,
  IntentOutput,
  IntentPolicy,
  IntentNodePayload,
  IntentStage,
  PluginContract,
  IntentTelemetry,
} from '@domain/recovery-intent-graph';

type IntentGraphSummaryPanelProps = Readonly<{
  readonly graphId: IntentGraphId;
  readonly policy: IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>;
  readonly telemetry: readonly IntentTelemetry[];
  readonly outputs: readonly IntentOutput[];
}>;

const round = (value: number): number => Math.round(value * 100) / 100;

const confidenceFromOutputs = (outputs: readonly IntentOutput[]): number =>
  outputs.length === 0
    ? 0
    : round(outputs.reduce((acc, output) => acc + output.score, 0) / outputs.length / 100);

const maxLatency = (telemetry: readonly IntentTelemetry[]): number =>
  telemetry.reduce((acc, item) => (item.elapsedMs > acc ? item.elapsedMs : acc), 0);

export const IntentGraphSummaryPanel = memo<IntentGraphSummaryPanelProps>(
  ({ graphId, policy, telemetry, outputs }) => {
    const stageList = policy.steps.join(' -> ');
    const recommendationCount = new Set(outputs.flatMap((output) => output.recommendations)).size;
    const elapsedTotal = round(telemetry.reduce((acc, item) => acc + item.elapsedMs, 0));
    const highestLatency = maxLatency(telemetry);
    const confidence = confidenceFromOutputs(outputs);
    const pluginCount = policy.plugins.length;
    const stageCount = policy.steps.length;
    const recommendationDensity = outputs.length === 0 ? 0 : round(recommendationCount / outputs.length);

    return (
      <aside className="intent-summary">
        <header>
          <h2>Recovery Intent Summary</h2>
          <p>{graphId}</p>
        </header>
        <dl>
          <div>
            <dt>Stages</dt>
            <dd>{stageCount}</dd>
          </div>
          <div>
            <dt>Plugins</dt>
            <dd>{pluginCount}</dd>
          </div>
          <div>
            <dt>Total Runtime</dt>
            <dd>{elapsedTotal}ms</dd>
          </div>
          <div>
            <dt>Max Latency</dt>
            <dd>{highestLatency}ms</dd>
          </div>
          <div>
            <dt>Confidence</dt>
            <dd>{(confidence * 100).toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Recommendation Density</dt>
            <dd>{recommendationDensity.toFixed(2)}</dd>
          </div>
        </dl>
        <p>{stageList}</p>
      </aside>
    );
  },
);

IntentGraphSummaryPanel.displayName = 'IntentGraphSummaryPanel';
