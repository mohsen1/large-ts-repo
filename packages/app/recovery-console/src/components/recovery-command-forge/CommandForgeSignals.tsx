import { useMemo, type ReactElement } from 'react';
import type { RecoveryCommandForgeState } from '../../hooks/useRecoveryCommandForgeWorkspace';
import { buildNodeStates } from '../../features/recovery-command-forge/engine';

interface Props {
  readonly state: RecoveryCommandForgeState;
}

export const CommandForgeSignals = ({ state }: Props): ReactElement => {
  const payload = useMemo(() => {
    if (!state.report) {
      return [] as readonly string[];
    }

    const report = state.report;
    return report.outcomes.flatMap((outcome) =>
      outcome.notes.map((note) => `outcome: ${note}`).concat(
        buildNodeStates(report).map((item) => `${item.nodeId}:${item.hasRisk ? 'risk' : 'safe'}:${item.readinessDelta.toFixed(1)}`),
      ),
    );
  }, [state.report]);

  return (
    <section className="command-forge-signal-stream">
      <h3>Signal timeline</h3>
      <p>{`events=${payload.length}`}</p>
      <ul>
        {payload.slice(0, 40).map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
      {payload.length > 40 ? <p>... truncated</p> : null}
    </section>
  );
};
