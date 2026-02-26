import { useMemo } from 'react';
import {
  useTypeLevelStressComposer,
  type ComposerSnapshot,
} from '../hooks/useTypeLevelStressComposer';
import { StressFusionMatrixPanel } from '../components/stress/StressFusionMatrixPanel';
import { StressScopeTopologyPanel } from '../components/stress/StressScopeTopologyPanel';
import { resolveConstraintChain } from '@shared/type-level/stress-constraint-orchestration-grid';
import { compileFlowResult } from '@shared/type-level/stress-controlflow-galaxy';
import { buildTokenLedger, runGuardedBudget } from '@shared/type-level/stress-modern-runtime-guards';

const renderSnapshot = (snapshot: ComposerSnapshot) => {
  return (
    <section style={{ background: '#0b1330', color: '#f4f7ff', padding: 12, borderRadius: 10, marginBottom: 12 }}>
      <div style={{ marginBottom: 8 }}>
        <strong>Selected route:</strong> {snapshot.selectedRoute}
      </div>
      <div>Split: {snapshot.split.join(' / ')}</div>
      <div>Route Class: {snapshot.routePayload.actionClass}</div>
      <div>Severity: {snapshot.routePayload.severity}</div>
      <div>Resolver domain: {snapshot.routeResolver.domain}</div>
      <div>Trace entries: {snapshot.branchTraceLength}</div>
      <div>Solver: {snapshot.solver.token}</div>
      <div>Route manifest count: {snapshot.labyrinthManifest.length}</div>
      <div>High-branch events: {snapshot.eventsBySeverity}</div>
    </section>
  );
};

const DashboardShell = ({
  header,
  children,
}: {
  header: string;
  children: React.ReactNode;
}) => (
  <section style={{ marginBottom: 16 }}>
    <header style={{ marginBottom: 8 }}>
      <h2>{header}</h2>
    </header>
    {children}
  </section>
);

export const RecoveryCockpitTypeStressNovaGridPage = () => {
  const composer = useTypeLevelStressComposer();
  const controlflow = compileFlowResult();
  const constraint = resolveConstraintChain('runtime', 'plan');
  const ledger = buildTokenLedger(['router', 'scheduler', 'planner', 'controller']);
  const runtime = runGuardedBudget(12);

  const runtimeSummary = useMemo(
    () => runtime.then((result) => ({
      ok: result.ok,
      total: result.ok ? result.value.total : 0,
      ledger: result.ok ? result.value.ledger.length : 0,
      average: result.ok ? result.value.average : 0,
    })),
    [runtime],
  );

  return (
    <main style={{ padding: 16, background: '#050d1f', color: '#eef2ff', minHeight: '100vh' }}>
      <h1>Type stress nova grid</h1>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <DashboardShell header="Composer snapshot">
          {renderSnapshot(composer.currentSnapshot)}
        </DashboardShell>
        <DashboardShell header="Constraint summary">
          <section style={{ background: '#0b1738', padding: 12, borderRadius: 10 }}>
            <div>domain={constraint.domain}</div>
            <div>verb={constraint.verb}</div>
            <div>items={constraint.items.length}</div>
            <div>critical={constraint.summary.critical}</div>
            <div>ratio={constraint.ratio.toFixed(3)}</div>
            <pre style={{ maxHeight: 180, overflowY: 'auto' }}>
              {JSON.stringify(constraint.trace, null, 2)}
            </pre>
          </section>
        </DashboardShell>
      </div>
      <DashboardShell header="Runtime controlflow">
        <div>branches={controlflow.total}</div>
        <div>first={controlflow.first}</div>
        <div>last={controlflow.last}</div>
        <div>lastSeen={controlflow.lastSeen}</div>
      </DashboardShell>
      <DashboardShell header="Ledger and telemetry">
        <div>
          {ledger.map((entry) => (
            <div key={entry.pair} style={{ marginBottom: 4 }}>
              {entry.pair} - {String(entry.valid)}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12 }}>
          {runtimeSummary.then((value) => (
            <div>
              {value.ok ? `runtime-total=${value.total}` : 'runtime pending'}
            </div>
          ))}
        </div>
      </DashboardShell>
      <DashboardShell header="Panels">
        <StressFusionMatrixPanel />
        <div style={{ height: 12 }} />
        <StressScopeTopologyPanel />
      </DashboardShell>
    </main>
  );
};
