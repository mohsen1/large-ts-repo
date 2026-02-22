import { useMemo } from 'react';
import { useStabilityCommands } from '../hooks/useStabilityCommands';
import { useStabilityMonitor } from '../hooks/useStabilityMonitor';
import { StabilityGrid } from '../components/stability/StabilityGrid';
import { TopSignalsPanel, buildSignalMatrix } from '../components/stability/TopSignalsPanel';
import { ScenarioPlaybookPanel } from '../components/stability/ScenarioPlaybookPanel';
import { ReadinessPulse } from '../components/stability/ReadinessPulse';
import { StabilityOrchestratorService } from '@service/recovery-stability-orchestrator';

export interface StabilityOperationsPageProps {
  readonly runId: Parameters<StabilityOrchestratorService['evaluateReadiness']>[0];
}

export const StabilityOperationsPage = ({ runId }: StabilityOperationsPageProps) => {
  const orchestrator = useMemo(() => new StabilityOrchestratorService(), []);
  const { summary, classCounts, topSignalRows, context, loading } = useStabilityMonitor({
    orchestrator,
    runId,
  });
  const { state, runPreview, runPublish, availableCommands } = useStabilityCommands(orchestrator);

  const matrix = buildSignalMatrix(context?.signals ?? []);

  return (
    <section>
      <h2>Stability Operations</h2>
      {loading ? <p>loading...</p> : null}
      <ReadinessPulse snapshot={summary?.readiness} />
      <ScenarioPlaybookPanel advice={summary?.envelope} />
      <TopSignalsPanel matrix={matrix} />
      <StabilityGrid signals={context?.signals ?? []} />
      <section>
        <h3>Class counts</h3>
        <pre>{JSON.stringify(classCounts, null, 2)}</pre>
      </section>
      <section>
        <h3>Top signal rows</h3>
        <ul>
          {topSignalRows.map((row) => (
            <li key={row}>{row}</li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Commands</h3>
        <button type="button" disabled={state.pending} onClick={() => void runPreview(runId)}>
          Preview
        </button>
        <button type="button" disabled={state.pending} onClick={() => void runPublish(runId)}>
          Publish
        </button>
        <ul>
          {availableCommands.map((item) => (
            <li key={item.command}>
              {item.command} {item.enabled ? 'enabled' : 'disabled'}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};
