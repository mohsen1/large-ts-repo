import { memo } from 'react';
import { useChaosLabConsoleFacade } from '../hooks/useChaosLabConsoleFacade';

interface ChaosLabConsolePanelProps {
  readonly tenant: string;
  readonly scenario: string;
}

interface MetricTileProps {
  readonly label: string;
  readonly value: string;
  readonly accent: `h-${string}`;
}

const MetricTile = memo(function MetricTile({ label, value, accent }: MetricTileProps) {
  return (
    <article className="chaos-metric" data-accent={accent}>
      <p>{label}</p>
      <h3>{value}</h3>
    </article>
  );
});

export const ChaosLabConsolePanel = ({ tenant, scenario }: ChaosLabConsolePanelProps) => {
  const { state, workspaceTitle, run, reset } = useChaosLabConsoleFacade({
    tenant,
    scenario,
    workspace: `${tenant}:${scenario}:lab`
  });

  const lines = (state.summary
    ? [
        {
          label: 'Run',
          value: state.summary.runId,
          accent: 'h-sky'
        },
        {
          label: 'Workspace',
          value: state.summary.workspace,
          accent: 'h-emerald'
        },
        {
          label: 'Intent',
          value: state.summary.intent,
          accent: 'h-violet'
        },
        {
          label: 'Entropy',
          value: `${state.summary.entropy.toFixed(2)}`,
          accent: 'h-amber'
        }
      ]
    : [
        {
          label: 'Workspace',
          value: workspaceTitle,
          accent: 'h-slate'
        },
        {
          label: 'Status',
          value: state.status,
          accent: 'h-slate'
        },
        {
          label: 'Events',
          value: `${state.eventCount}`,
          accent: 'h-slate'
        }
      ]) as readonly MetricTileProps[];

  return (
    <section className="chaos-lab-console-panel">
      <header className="chaos-lab-console-panel__header">
        <h2>{`Chaos Console: ${workspaceTitle}`}</h2>
        <div className="controls">
          <button type="button" onClick={() => void run()} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? 'Running...' : 'Run'}
          </button>
          <button type="button" onClick={reset}>
            Reset
          </button>
        </div>
      </header>
      <div className="metric-grid">
        {lines.map((line) => (
          <MetricTile key={line.label} label={line.label} value={line.value} accent={line.accent} />
        ))}
      </div>
      {state.lastError ? (
        <aside className="error-banner" role="alert">
          {`${state.lastError.source}: ${state.lastError.message}`}
        </aside>
      ) : null}
    </section>
  );
};
