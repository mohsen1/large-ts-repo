import { FC, useMemo } from 'react';
import { useRecoveryStudioOrchestrator } from '../hooks/useRecoveryStudioOrchestrator';
import { useCockpitWorkspace } from '../hooks/useCockpitWorkspace';
import { useRecoveryStudioDiagnostics } from '../hooks/useRecoveryStudioDiagnostics';
import type { RecoveryRunbook, StageNode } from '@domain/recovery-orchestration-design';
import { withBrand } from '@shared/core';
import type { RecoveryPlan } from '@domain/recovery-cockpit-models';

const TENANT = 'tenant:studio-diagnostics';

const phaseFromIndex = (index: number): StageNode['phase'] =>
  (['discover', 'stabilize', 'mitigate', 'validate', 'document'][index % 5] as StageNode['phase']);

const toRunbook = (plan: RecoveryPlan): RecoveryRunbook => {
  const now = new Date().toISOString();
  const nodes = plan.actions.map<StageNode>((action, index) => ({
    id: String(action.id),
    title: action.command,
    phase: phaseFromIndex(index),
    severity: 'low',
    status: 'pending',
    metrics: {
      slo: 0.5,
      capacity: 0.6,
      compliance: 0.8,
      security: 0.7,
    },
    prerequisites: action.dependencies.map((dependency) => String(dependency)),
  }));

  return {
    tenant: withBrand('tenant:studio', 'TenantId'),
    workspace: withBrand('workspace:studio', 'WorkspaceId'),
    scenarioId: withBrand(String(plan.planId), 'ScenarioId'),
    title: `Diag ${plan.labels.short}`,
    nodes,
    edges: nodes
      .map((entry, index) => ({
        from: entry.id,
        to: nodes[index + 1]?.id ?? entry.id,
        latencyMs: 90,
      }))
      .filter((edge) => edge.from !== edge.to),
    directives: [],
    createdAt: now,
    updatedAt: now,
  };
};

const normalizeTelemetryRate = (value: number): number => Math.round(value * 100) / 100;

export const RecoveryCockpitStudioDiagnosticsPage: FC = () => {
  const workspace = useCockpitWorkspace({ parallelism: 2, maxRuntimeMinutes: 20 });
  const plans = useMemo<readonly RecoveryRunbook[]>(() => workspace.plans.map((plan) => toRunbook(plan)), [workspace.plans]);

  const orchestrator = useRecoveryStudioOrchestrator({
    tenant: TENANT,
    workspace: 'workspace:studio-diagnostics',
    runbooks: plans,
    plans: workspace.plans,
    autoStartOnMount: false,
  });

  const diagnostics = useRecoveryStudioDiagnostics({ runs: orchestrator.runs });

  return (
    <main style={{
      minHeight: '100vh',
      padding: 24,
      fontFamily: 'Georgia, serif',
      background: 'radial-gradient(circle at 20% 20%, #10214b, #040b1c 45%, #02060f)',
      color: '#ecf2ff',
      display: 'grid',
      gap: 16,
    }}>
      <header>
        <h1>Studio Diagnostics</h1>
        <p>Signal-oriented diagnostics for studio-level orchestration runs.</p>
      </header>

      <section>
        <button type="button" onClick={() => orchestrator.runs.length && orchestrator.stop()} style={{ marginRight: 8 }}>
          Stop active
        </button>
        <button type="button" onClick={() => orchestrator.clear()}>
          Clear
        </button>
      </section>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))' }}>
        <article>
          <h2>Total runs</h2>
          <p>{diagnostics.totalRuns}</p>
        </article>
        <article>
          <h2>Latest status</h2>
          <p>{diagnostics.latestStatus}</p>
        </article>
        <article>
          <h2>Average ticks</h2>
          <p>{normalizeTelemetryRate(diagnostics.averageTickCount)}</p>
        </article>
        <article>
          <h2>Plugin hits</h2>
          <p>{diagnostics.pluginHitCount}</p>
        </article>
      </section>

      <section>
        <h3>Runbook candidates ({plans.length})</h3>
        <ul>
          {plans.map((plan, index) => (
            <li key={`${plan.scenarioId}-${index}`}>
              {plan.title}
              <button type="button" onClick={() => void orchestrator.start(plan)} style={{ marginLeft: 12 }}>
                start
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Status trail</h3>
        <ul>
          {orchestrator.runs.map((run) => (
            <li key={run.sessionId}>
              {run.sessionId} ({run.status})
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Trend breakdown</h3>
        <ol>
          {diagnostics.trend.map((entry) => (
            <li key={entry.label}>
              {entry.label}: {entry.value}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
};
