import { useMemo } from 'react';
import type {
  OrchestratedRun,
  OrchestrationDiagnostic,
} from '@domain/recovery-chronicle-orchestrator';

interface ChronicleRunConsoleProps {
  readonly run?: OrchestratedRun;
  readonly diagnostics: readonly OrchestrationDiagnostic[];
}

export const ChronicleRunConsole = ({ run, diagnostics }: ChronicleRunConsoleProps) => {
  const summary = useMemo(() => {
    const status = run?.status ?? 'idle';
    const outputs = run?.output ?? [];
    const maxScore = outputs.reduce((acc, entry) => Math.max(acc, entry.score), 0);
    return {
      status,
      outputs: outputs.length,
      maxScore,
      ready: outputs.length > 0 ? outputs.every((entry) => entry.status === 'ok') : false,
    };
  }, [run]);

  return (
    <section>
      <h3>Run console</h3>
      <p>{`status=${summary.status} outputs=${summary.outputs} maxScore=${summary.maxScore.toFixed(2)} ready=${String(summary.ready)}`}</p>
      <ul>
        {diagnostics.map((diagnostic) => (
          <li key={`${diagnostic.runId}-${diagnostic.key}-${diagnostic.message}`}>
            <code>{diagnostic.key}</code> {diagnostic.message}
          </li>
        ))}
      </ul>
      {diagnostics.length === 0 ? <p>No diagnostics yet.</p> : null}
    </section>
  );
};
