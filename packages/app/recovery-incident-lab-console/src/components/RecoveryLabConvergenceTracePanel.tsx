import { type ReactElement, useMemo } from 'react';
import type { ConvergenceOutput } from '@domain/recovery-lab-orchestration-core';

interface TimelineEvent {
  readonly name: string;
  readonly at: string;
}

export interface ConvergenceTracePanelProps {
  readonly runId: string;
  readonly output: ConvergenceOutput;
  readonly events: readonly string[];
}

const buildLines = (events: readonly string[], runId: string): readonly TimelineEvent[] => {
  return events.toSorted().map((entry) => ({
    name: entry,
    at: `${runId}:${entry}`,
  }));
};

const countUnique = (values: readonly string[]): number => new Set(values).size;

export const RecoveryLabConvergenceTracePanel = ({ runId, output, events }: ConvergenceTracePanelProps): ReactElement => {
  const timeline = useMemo(() => buildLines(events, runId), [events, runId]);
  const score = output.score;

  return (
    <section className="recovery-lab-convergence-trace-panel">
      <header>
        <h3>Runtime Trace</h3>
        <p>
          run={runId} stage={output.stage} score={score.toFixed(3)} confidence={output.confidence.toFixed(3)}
        </p>
      </header>
      <p>diagnostics={output.diagnostics.length}</p>
      <p>signalKeys={countUnique(output.signalDigest.input.toString().split(',').filter(Boolean).concat(output.signalDigest.resolve.toString()))}</p>
      <ul>
        {timeline.map((entry) => (
          <li key={`${entry.at}-${entry.name}`}>
            {entry.name} @ {entry.at}
          </li>
        ))}
      </ul>
    </section>
  );
};
