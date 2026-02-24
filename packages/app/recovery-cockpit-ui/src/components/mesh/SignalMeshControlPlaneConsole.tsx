import { memo, useMemo } from 'react';
import { toRuntimeStatus } from './SignalMeshPolicyTimeline';
import type { MeshControlExecutionResult } from '../../services/meshControlPlaneScenarioService';

export interface SignalMeshControlPlaneConsoleProps {
  readonly selected: boolean;
  readonly result: MeshControlExecutionResult;
  readonly onSelect: (runId: string) => void;
  readonly onReplay: (runId: string) => void;
}

type ResultCell = {
  readonly key: string;
  readonly value: string;
};

const buildRows = (result: MeshControlExecutionResult): readonly ResultCell[] => [
  { key: 'runId', value: result.runId },
  { key: 'score', value: result.score.toFixed(6) },
  { key: 'confidence', value: result.confidence.toFixed(4) },
  { key: 'lanes', value: result.lanes.join(', ') || 'none' },
  { key: 'traces', value: String(result.traces.length) },
];

type TraceBucket = { readonly bucket: string; readonly count: number };

const buildTraceBuckets = (traces: readonly string[]): readonly TraceBucket[] => {
  const bucket = new Map<string, number>();
  for (const trace of traces) {
    const [metric = 'global'] = trace.split(':');
    const value = bucket.get(metric) ?? 0;
    bucket.set(metric, value + 1);
  }

  return [...bucket.entries()]
    .map(([bucket, count]) => ({ bucket, count }))
    .toSorted((left, right) => right.count - left.count);
};

export const SignalMeshControlPlaneConsole = memo<SignalMeshControlPlaneConsoleProps>(({
  selected,
  result,
  onSelect,
  onReplay,
}) => {
  const rows = useMemo(() => buildRows(result), [result]);
  const status = useMemo(() => toRuntimeStatus(result), [result]);
  const buckets = useMemo(() => buildTraceBuckets(result.traces), [result.traces]);

  return (
    <article className={`mesh-control-plane-console ${selected ? 'is-selected' : ''}`}>
      <header>
        <h3>Run {result.runId}</h3>
        <p>{result.ok ? 'ok' : 'error'}</p>
        <p>{status}</p>
      </header>
      <ul>
        {rows.map((entry) => (
          <li key={`${result.runId}:${entry.key}`}>
            <span>{entry.key}</span>
            <strong>{entry.value}</strong>
          </li>
        ))}
      </ul>
      <section className="mesh-control-plane-console__buckets">
        {buckets.map((bucket) => (
          <div key={`${result.runId}:${bucket.bucket}`}>
            <span>{bucket.bucket}</span>
            <strong>{bucket.count}</strong>
          </div>
        ))}
      </section>
      <footer>
        <button type="button" onClick={() => onSelect(result.runId)}>
          Inspect
        </button>
        <button type="button" onClick={() => onReplay(result.runId)}>
          Replay
        </button>
      </footer>
    </article>
  );
});
