import { useHorizonLabWorkspace } from '../hooks/useHorizonLabWorkspace';
import { HorizonLabControlPanel } from '../components/HorizonLabControlPanel';
import { HorizonLabStrategyBoard } from '../components/HorizonLabStrategyBoard';
import { HorizonLabSignalTimeline } from '../components/HorizonLabSignalTimeline';

const PageHeader = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <header>
    <h1>{title}</h1>
    <p>{subtitle}</p>
  </header>
);

const MetricCard = ({ label, value }: { label: string; value: string | number }) => (
  <article className="metric-card">
    <h4>{label}</h4>
    <p>{value}</p>
  </article>
);

const MetricsStrip = ({ plans, signals, elapsed }: { plans: number; signals: number; elapsed: number }) => (
  <section className="metric-strip">
    <MetricCard label="Plans" value={plans} />
    <MetricCard label="Signals" value={signals} />
    <MetricCard label="Elapsed" value={`${elapsed}ms`} />
  </section>
);

const ErrorPanel = ({ error }: { error?: string }) => {
  if (!error) {
    return null;
  }
  return (
    <section className="error-panel">
      <h4>Workspace Error</h4>
      <p>{error}</p>
    </section>
  );
};

export const RecoveryHorizonLabPage = () => {
  const workspace = useHorizonLabWorkspace();
  const hasError = workspace.state.loading && !workspace.state.plans.length && !workspace.queryResult;

  return (
    <main className="horizon-lab-page">
      <PageHeader title="Recovery Horizon Lab" subtitle="Cross-module stress harness for horizon planning and orchestration" />
      <ErrorPanel error={hasError ? 'no data loaded' : undefined} />
      <MetricsStrip
        plans={workspace.state.plans.length}
        signals={workspace.state.signals.length}
        elapsed={workspace.state.elapsedMs}
      />
      <HorizonLabControlPanel
        workspace={workspace}
        onChange={workspace.actions.applyFilters}
      />
      <section className="workspace-main">
        <HorizonLabStrategyBoard workspace={workspace} />
        <HorizonLabSignalTimeline workspace={workspace} />
      </section>
    </main>
  );
};
