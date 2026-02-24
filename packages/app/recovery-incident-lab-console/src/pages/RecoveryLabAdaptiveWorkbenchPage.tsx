import { type ReactElement, useMemo } from 'react';
import { RecoveryLabAdaptiveDashboard } from '../components/RecoveryLabAdaptiveDashboard';
import { RecoveryLabAdaptivePolicyGrid } from '../components/RecoveryLabAdaptivePolicyGrid';
import { useRecoveryLabAdaptiveOrchestration } from '../hooks/useRecoveryLabAdaptiveOrchestration';
import type { ReactNode } from 'react';

const MetricCard = ({ title, value }: { readonly title: string; readonly value: string }): ReactElement => (
  <article className="metric-card">
    <h4>{title}</h4>
    <p>{value}</p>
  </article>
);

const CardGrid = ({ nodes }: { readonly nodes: readonly { readonly title: string; readonly value: string }[] }): ReactElement => (
  <section className="adaptive-cards">
    {nodes.map((node) => (
      <MetricCard key={node.title} title={node.title} value={node.value} />
    ))}
  </section>
);

const RunSummary = ({ children }: { readonly children: ReactNode }): ReactElement => {
  return (
    <section className="run-summary">
      <h3>Run summary panel</h3>
      {children}
    </section>
  );
};

export const RecoveryLabAdaptiveWorkbenchPage = (): ReactElement => {
  const { state, run, eventText } = useRecoveryLabAdaptiveOrchestration();

  const diagnostics = state.diagnostics;
  const snapshots = state.response?.snapshots ?? [];
  const plan = state.response?.outcome?.plan;
  const runOutput = state.response?.outcome?.output;

  const metricNodes = useMemo(
    () => [
      { title: 'scenario', value: state.scenario },
      { title: 'tenant', value: state.tenantId },
      { title: 'mode', value: state.mode },
      { title: 'diagnostics', value: String(diagnostics.length) },
      { title: 'snapshots', value: String(snapshots.length) },
      { title: 'events', value: String(eventText.length) },
    ],
    [state.scenario, state.tenantId, state.mode, diagnostics.length, snapshots.length, eventText.length],
  );

  const runActions = useMemo(() => {
    return (
      <div className="run-actions">
        <button type="button" onClick={() => run('simulate')}>simulate</button>
        <button type="button" onClick={() => run('validate')}>validate</button>
        <button type="button" onClick={() => run('execute')}>execute</button>
      </div>
    );
  }, [run]);

  return (
    <article className="recovery-lab-adaptive-workbench-page">
      <header>
        <h2>Adaptive Workbench</h2>
        <p>{state.summary}</p>
      </header>

      <CardGrid nodes={metricNodes} />
      <RunSummary>
        {runActions}
      </RunSummary>

      <RecoveryLabAdaptiveDashboard
        response={state.response as any}
        plan={plan}
        run={runOutput as any}
        snapshots={snapshots as any}
        diagnostics={diagnostics as any}
      />

      <RecoveryLabAdaptivePolicyGrid />
    </article>
  );
};
