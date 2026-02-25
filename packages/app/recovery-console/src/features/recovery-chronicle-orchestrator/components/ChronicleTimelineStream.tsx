import { useMemo } from 'react';
import type { OrchestratedStepResult, OrchestrationDiagnostic } from '@domain/recovery-chronicle-orchestrator';

interface ChronicleTimelineStreamProps {
  readonly outputs: readonly OrchestratedStepResult[];
  readonly diagnostics: readonly OrchestrationDiagnostic[];
}

export const ChronicleTimelineStream = ({ outputs, diagnostics }: ChronicleTimelineStreamProps) => {
  const timeline = useMemo(
    () =>
      outputs.map((entry, index) => ({
        key: `${entry.stage}-${index}`,
        stage: entry.stage,
        status: entry.status,
        output: entry.output,
        latencyMs: entry.latencyMs,
        score: entry.score,
      })),
    [outputs],
  );

  if (!timeline.length) {
    return <p>No timeline events yet.</p>;
  }

  return (
    <section>
      <h3>Timeline stream</h3>
      <ol>
        {timeline.map((entry) => (
          <li key={entry.key}>
            <strong>{entry.stage}</strong> {entry.status} score={entry.score} latency={entry.latencyMs}
            <pre>{JSON.stringify(entry.output, undefined, 2)}</pre>
            {diagnostics.filter((item) => item.message.includes(entry.stage)).map((item) => (
              <p key={`${entry.key}-${item.key}`}>{item.key}</p>
            ))}
          </li>
        ))}
      </ol>
    </section>
  );
};
