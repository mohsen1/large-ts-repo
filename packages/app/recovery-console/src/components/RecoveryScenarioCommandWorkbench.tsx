import { useMemo } from 'react';

export interface RecoveryScenarioState {
  readonly status: 'idle' | 'running' | 'ready' | 'failed';
  readonly selectedTemplateId: string;
  readonly selectedTemplateTitle: string;
  readonly selectedRevision?: string;
  readonly diagnostics: readonly string[];
  readonly reasonMap: Record<string, readonly string[]>;
  readonly candidateCount: number;
  readonly blockedCount: number;
  readonly riskScore: number;
  readonly runAt: string;
}

export interface RecoveryScenarioCommandWorkbenchProps {
  readonly state: RecoveryScenarioState;
  readonly canRun: boolean;
  readonly onRun: () => void;
  readonly health: 'green' | 'yellow' | 'red';
}

const LABELS: Record<string, string> = {
  running: 'running',
  ready: 'ready',
  idle: 'ready',
  failed: 'failed',
};

export const RecoveryScenarioCommandWorkbench = ({
  state,
  canRun,
  onRun,
  health,
}: RecoveryScenarioCommandWorkbenchProps) => {
  const label = useMemo(() => {
    if (!canRun) return 'No scenario input yet';
    if (state.candidateCount === 0) return 'Awaiting candidate synthesis';
    if (state.blockedCount === state.candidateCount) return 'All candidates blocked';
    return 'Candidates available';
  }, [canRun, state.candidateCount, state.blockedCount]);

  return (
    <section className="scenario-command-workbench">
      <header>
        <h2>Scenario command workbench</h2>
        <p>{label}</p>
      </header>

      <div className="scenario-meta">
        <span>Tenant: {state.selectedTemplateTitle || 'unresolved'}</span>
        <span className={`health-${health}`}>Health: {health}</span>
        <span>State: {state.status}</span>
      </div>

      <div className="metrics-grid">
        <article>
          <h3>Selection</h3>
          <p>Selected scenario: {state.selectedTemplateId || 'none'}</p>
          <p>Revision: {state.selectedRevision || 'n/a'}</p>
        </article>
        <article>
          <h3>Quality</h3>
          <p>Candidates: {state.candidateCount}</p>
          <p>Blocked: {state.blockedCount}</p>
          <p>Risk score: {state.riskScore}</p>
        </article>
        <article>
          <h3>Signals</h3>
          <p>Template updates: {state.diagnostics.length}</p>
          <p>Updated: {state.runAt || 'never'}</p>
        </article>
      </div>

      <button type="button" onClick={onRun} disabled={!canRun || state.status === 'running'}>
        {LABELS[state.status]}
      </button>

      <ul>
        {state.diagnostics.slice(0, 8).map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>
    </section>
  );
};
