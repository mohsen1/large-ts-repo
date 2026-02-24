import { useMemo } from 'react';
import type { MeshScenarioResult } from '../../services/recoveryCockpitOrchestrationService';

type TraceValue = {
  readonly kind: string;
  readonly value: number;
  readonly at: string;
};

export interface SignalMeshExecutionBoardProps {
  readonly run: MeshScenarioResult;
  readonly maxRows: number;
  readonly onClear?: () => void;
}

const parseTrace = (values: readonly string[]): readonly TraceValue[] =>
  values.map((entry) => {
    const [kind, value] = entry.split('=');
    return {
      kind: kind?.trim() ?? 'unknown',
      value: Number(value) || 0,
      at: new Date().toISOString(),
    };
  });

const maxBy = <T,>(values: readonly T[], selector: (value: T) => number): number =>
  values.reduce((max, current) => Math.max(max, selector(current)), Number.NEGATIVE_INFINITY);

export const SignalMeshExecutionBoard = ({
  run,
  maxRows,
  onClear,
}: SignalMeshExecutionBoardProps) => {
  const traces = useMemo(() => parseTrace(run.traces), [run.traces]);
  const normalized = useMemo(() => {
    const clipped = traces.toSorted((left, right) => right.value - left.value);
    const ratio = maxBy(clipped, (entry) => entry.value) || 1;
    return clipped.slice(0, maxRows).map((entry) => ({
      ...entry,
      value: entry.value / ratio,
    }));
  }, [maxRows, traces]);

  return (
    <section>
      <header>
        <h4>{run.runId}</h4>
        <button type="button" onClick={() => onClear?.()}>
          Clear traces
        </button>
      </header>
      <ol>
        {normalized.map((entry, index) => (
          <li key={`${entry.kind}-${index}`}>
            <strong>{entry.kind}</strong>
            <span>{entry.at}</span>
            <progress max={1} value={entry.value} />
          </li>
        ))}
      </ol>
    </section>
  );
};
