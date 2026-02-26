import { TypeStressOrchestratorPanel } from '../components/stress-lab/TypeStressOrchestratorPanel';
import { useTypeStressOrchestrator } from '../hooks/useTypeStressOrchestrator';

export const TypeStressOrchestratorPage = () => {
  const {
    status,
    rows,
    topologyRows,
    topologySummary,
    dispatches,
    snapshot,
    runOrchestrator,
    clear,
    isRunning,
  } = useTypeStressOrchestrator();

  const branchSummary = (() => {
    let branch = 'idling';
    if (isRunning) {
      branch = 'active';
    } else if (snapshot.transitionPlan > 0) {
      branch = 'settled';
    }
    return branch;
  })();

  const statusRows = rows.length + topologyRows.length + dispatches.length;

  return (
    <main className="type-stress-orchestrator-page">
      <section>
        <h1>Type Stress Orchestrator Studio</h1>
        <p>Orchestrator status: {status}</p>
        <p>Branch: {branchSummary}</p>
        <p>Total route rows: {statusRows}</p>
      </section>

      <TypeStressOrchestratorPanel
        onRefresh={() => {
          void runOrchestrator();
        }}
        snapshots={rows}
        topology={topologySummary}
        dispatches={dispatches}
        status={snapshot.constraintTrace}
      />

      <section>
        <button type="button" onClick={runOrchestrator} disabled={isRunning}>
          runOrchestrate
        </button>
        <button type="button" onClick={clear}>
          clear
        </button>
      </section>

      <section>
        <h2>Stress Diagnostics</h2>
        <ul>
          <li>Dispatch count: {snapshot.dispatchCount}</li>
          <li>Active count: {snapshot.activeCount}</li>
          <li>Machine plan length: {snapshot.machinePlan}</li>
          <li>Transition length: {snapshot.transitionPlan}</li>
          <li>Topology size: {snapshot.topologySize}</li>
        </ul>
      </section>
    </main>
  );
};
