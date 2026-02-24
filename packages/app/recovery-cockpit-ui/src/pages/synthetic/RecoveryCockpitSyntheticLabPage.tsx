import { FC, useMemo } from 'react';
import {
  useSyntheticLabController,
} from '../../hooks/useSyntheticLabController';
import {
  SyntheticScenarioTable,
  severityScore,
} from '../../components/synthetic/SyntheticScenarioTable';
import { SyntheticPlanTimeline } from '../../components/synthetic/SyntheticPlanTimeline';
import { SyntheticRunGrid } from '../../components/synthetic/SyntheticRunGrid';

const actorDefaults = ['operator', 'analyst', 'sim-engine'] as const;

const nextActor = (tenant: string, actor: string, offset: number): string => `${tenant}:${actor}:${offset}`;

const mapModeLabel = (mode: 'simulate' | 'drill' | 'predict'): string =>
  ({ simulate: 'Simulate', drill: 'Drill', predict: 'Predict' } as const)[mode];

const severityOrder = (severity: readonly string[]) =>
  [...severity].toSorted((left, right) => {
    const leftScore = left === 'critical' ? 3 : left === 'high' ? 2 : left === 'medium' ? 1 : 0;
    const rightScore = right === 'critical' ? 3 : right === 'high' ? 2 : right === 'medium' ? 1 : 0;
    return rightScore - leftScore;
  });

export const RecoveryCockpitSyntheticLabPage: FC = () => {
  const controller = useSyntheticLabController({
    planMode: 'simulate',
    tenant: 'tenant-neo' as TenantId,
    actor: actorDefaults[0],
    includeDiagnostics: true,
  });

  const { state } = controller;
  const sortedTenants = useMemo(() => severityOrder(state.tenants), [state.tenants]);
  const totalFrames = state.audit.reduce((acc, entry) => acc + entry.frameCount, 0);

  const auditLabels = useMemo(() =>
    state.audit.map((entry) => ({
      ...entry,
      score: `${Math.round(entry.avgDiagnostics * 100)}ms`,
    })),
  [state.audit]);

  const scenarioRows = useMemo(() =>
    state.plans.map((plan) => ({
      ...plan,
      score: severityScore(plan.severity),
      stepCount: plan.steps.length,
      criticality: plan.severity,
      ageHours: ((Date.now() - Date.parse(plan.startedAt)) / 3600000),
      tenant: plan.tenant,
      tags: [...plan.tags],
      id: plan.id,
    })),
  [state.plans]);

  return (
    <main style={{ padding: 20, display: 'grid', gap: 18 }}>
      <header>
        <h1>Recovery Cockpit Synthetic Lab</h1>
        <p>
          Tenant: {state.activeTenant} · Mode: {mapModeLabel(state.planMode)} · Plans: {state.scenarioCount}
        </p>
      </header>

      <section style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <button type="button" onClick={() => void controller.seed()} disabled={state.loading}>
          Seed synthetic scenarios
        </button>
        <button
          type="button"
          onClick={() => controller.setPlanMode('simulate')}
          disabled={state.loading}
        >
          Sim mode
        </button>
        <button
          type="button"
          onClick={() => controller.setPlanMode('drill')}
          disabled={state.loading}
        >
          Drill mode
        </button>
        <button
          type="button"
          onClick={() => controller.setPlanMode('predict')}
          disabled={state.loading}
        >
          Predict mode
        </button>
        <button
          type="button"
          onClick={() => void controller.runSelected(nextActor(state.activeTenant, actorDefaults[1], 10), state.audit.length > 1)}
          disabled={state.loading || state.selectedScenario === undefined}
        >
          Run selected
        </button>
        <button
          type="button"
          onClick={() => void controller.runAll(nextActor(state.activeTenant, actorDefaults[2], 22))}
          disabled={state.loading}
        >
          Run all scenarios
        </button>
        <button type="button" onClick={() => void controller.refreshAudit()} disabled={state.loading}>
          Refresh telemetry
        </button>
      </section>

      <section style={{ display: 'grid', gap: 16, gridTemplateColumns: '1fr 1fr' }}>
        <article>
          <h2>Tenants</h2>
          <ul>
            {sortedTenants.map((tenant) => (
              <li key={tenant}>
                <button type="button" onClick={() => controller.selectTenant(tenant as typeof state.activeTenant)}>
                  {tenant}
                </button>
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h2>Execution telemetry</h2>
          <p>Frames: {totalFrames}</p>
          <ul>
            {auditLabels.map((entry) => (
              <li key={entry.scenario}>
                {entry.scenario}: {entry.topPlugin} ({entry.frameCount}, {entry.score})
              </li>
            ))}
          </ul>
        </article>
      </section>

      <SyntheticScenarioTable
        tenant={state.activeTenant}
        catalogDigest={state.scenarioDigest}
        plans={scenarioRows}
        onSelectScenario={(scenarioId) => controller.selectScenario(scenarioId)}
        selectedId={state.selectedScenario?.id}
        runQueue={state.runHistory.length > 0 ? state.runHistory.map((entry) => entry.result.runId) : state.runQueue}
      />

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <SyntheticPlanTimeline scenario={state.selectedScenario} />
        <SyntheticRunGrid
          runs={state.runHistory}
          onReplay={(runId) => console.log(`replay ${runId}`)}
          selectedPlan={state.selectedScenario?.id}
        />
      </section>

      <footer>
        <pre>{state.loading ? 'Loading synthetic operations...' : `Telemetry latency: ${state.telemetry.avgDurationMs}ms`}</pre>
      </footer>
    </main>
  );
};
import { TenantId } from '@domain/recovery-cockpit-synthetic-lab';
