import { FC, useMemo } from 'react';
import { type QuantumRunResultView } from '../../services/quantumStudioService';

type QuantumCommandDeckProps = {
  readonly runs: readonly QuantumRunResultView[];
  readonly onReplay: (id: string) => void;
  readonly selectedId?: string;
};

export const QuantumCommandDeck: FC<QuantumCommandDeckProps> = ({ runs, onReplay, selectedId }) => {
  const buckets = useMemo(
    () =>
      runs.map((run) => {
        const hasArtifacts = run.run.artifacts.length;
        const output = run.run.output;
        return {
          id: run.run.runId,
          scenarioId: output.scenario.scenarioId,
          status: run.run.status,
          artifacts: hasArtifacts,
          score: run.summary.results.durationMs,
          state: run.signalState,
        };
      }),
    [runs],
  );

  return (
    <section style={{ border: '1px solid #d7dbe8', borderRadius: 12, padding: 14 }}>
      <h3>Quantum command deck</h3>
      <ul style={{ display: 'grid', gap: 12, listStyle: 'none', padding: 0 }}>
        {buckets.map((entry) => (
          <li
            key={entry.id}
            style={{
              border: entry.id === selectedId ? '1px solid #4c6ef5' : '1px solid #e4e7ee',
              borderRadius: 8,
              padding: 10,
            }}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>Run {entry.id}</p>
            <p style={{ margin: 0 }}>Scenario {entry.scenarioId}</p>
            <p style={{ margin: 0 }}>Status {entry.status}</p>
            <p style={{ margin: 0 }}>Artifacts {entry.artifacts}</p>
            <p style={{ margin: 0 }}>Latency {entry.score}ms</p>
            <p style={{ margin: 0 }}>Signal {entry.state}</p>
            <button type="button" onClick={() => onReplay(entry.id)}>
              Replay
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
