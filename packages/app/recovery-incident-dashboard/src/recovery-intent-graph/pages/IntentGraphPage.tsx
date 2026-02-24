import { useMemo } from 'react';
import {
  createContextNodes,
  runIntentGraph,
  type IntentGraphServiceResult,
} from '../services/intentGraphService';
import { IntentGraphTopology } from '../components/IntentGraphTopology';
import { IntentGraphSummaryPanel } from '../components/IntentGraphSummaryPanel';
import { useIntentGraphSignals } from '../hooks/useIntentGraphSignals';
import { useIntentGraphWorkspace } from '../hooks/useIntentGraphWorkspace';
import { buildHealth } from '@domain/recovery-intent-graph';
import {
  type IntentPolicy,
  type PluginContract,
  type IntentStage,
  type IntentNodePayload,
} from '@domain/recovery-intent-graph';

type RecoveryIntentGraphPageProps = {
  readonly policy: IntentPolicy<readonly PluginContract<IntentStage, IntentNodePayload, IntentNodePayload>[]>;
};

const formatErrorMessage = (result: IntentGraphServiceResult | undefined): string => {
  if (!result) return 'No execution result';
  if (result.outputs.length === 0) return 'No outputs emitted';
  return `Run ${result.id} completed`;
};

export const IntentGraphPage = ({ policy }: RecoveryIntentGraphPageProps) => {
  const { status, result, errors, rerun } = useIntentGraphWorkspace(policy);
  const nodes = useMemo(() => createContextNodes(policy), [policy]);

  const signalState = useIntentGraphSignals(result?.telemetry ?? [], result?.outputs ?? []);
  const health = result
    ? buildHealth(policy.id, result.telemetry)
    : { graphId: policy.id, stageBuckets: [], confidence: 0, recommendations: [] };

  return (
    <main className="recovery-intent-page">
      <header>
        <h1>Recovery Intent Graph</h1>
        <p>{policy.id}</p>
      </header>
      <section className="actions">
        <button onClick={rerun} disabled={status === 'running'}>
          {status === 'running' ? 'Running...' : 'Run Intent Graph'}
        </button>
        <p>{formatErrorMessage(result)}</p>
      </section>
      <IntentGraphSummaryPanel
        graphId={policy.id}
        policy={policy}
        telemetry={result?.telemetry ?? []}
        outputs={result?.outputs ?? []}
      />
      <IntentGraphTopology
        policy={policy}
        telemetry={result?.telemetry ?? []}
        outputs={result?.outputs ?? []}
      />
      <section className="signal-grid">
        <h3>Signal Signals</h3>
        <p>{signalState.totalSignals} points · trend {signalState.trend}</p>
        <ul>
          {signalState.timeline.map((point) => (
            <li key={point.signal}>
              {point.signal} {Math.round(point.intensity * 100)}%
            </li>
          ))}
        </ul>
        <p>{health.stageBuckets.length} stage buckets, confidence {(health.confidence * 100).toFixed(1)}%</p>
        <ul>
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Nodes</h3>
        <pre>{JSON.stringify(nodes, null, 2)}</pre>
      </section>
    </main>
  );
};
