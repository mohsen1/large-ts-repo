import { useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import { useRecoveryOpsWorkspace } from '../hooks/useRecoveryOpsWorkspace';
import { useRecoverySimulationWorkspace } from '../hooks/useRecoverySimulationWorkspace';
import { RecoveryOperationsOverviewPanel } from '../components/RecoveryOperationsOverviewPanel';
import { RecoveryCommandSurfacePanel } from '../components/RecoveryCommandSurfacePanel';
import type { RecoverySignal } from '@domain/recovery-operations-models';
import type { RecoveryMode, RecoveryPriority, RecoveryProgram } from '@domain/recovery-orchestration';

const defaultPlan: RecoveryProgram = {
  id: withBrand('global:default-program', 'RecoveryProgramId'),
  tenant: withBrand('global', 'TenantId'),
  service: withBrand('svc', 'ServiceId'),
  name: 'default strategy plan',
  description: 'default plan for strategy page',
  priority: 'silver' as RecoveryPriority,
  mode: 'defensive' as RecoveryMode,
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
    timezone: 'UTC',
  },
  topology: {
    rootServices: ['planner'],
    fallbackServices: ['planner-fallback'],
    immutableDependencies: [['planner', 'planner-fallback']],
  },
  constraints: [],
  steps: [],
  owner: 'orchestrator',
  tags: ['strategy'],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

export const RecoveryOperationsStrategyPage = () => {
  const simulation = useRecoverySimulationWorkspace();
  const [planSeed] = useState('seed');

  const syntheticSignals = useMemo<readonly RecoverySignal[]>(() => {
    return simulation.selected ? [
      {
        id: `${simulation.selected.scenarioId}:signal-a`,
        source: 'planner',
        severity: Math.max(1, simulation.selected.score / 10),
        confidence: 0.76,
        detectedAt: new Date().toISOString(),
        details: { severityBand: simulation.selected.readinessState },
      },
    ] : [];
  }, [simulation.selected, planSeed]);

  const workspace = useRecoveryOpsWorkspace({
    tenant: 'global',
    signals: syntheticSignals,
    plans: [
      {
        id: withBrand(`global:strategy-plan-${planSeed}`, 'RunPlanId'),
        name: 'strategy-plan',
        program: defaultPlan,
        constraints: {
          maxParallelism: 4,
          maxRetries: 2,
          timeoutMinutes: 25,
          operatorApprovalRequired: false,
        },
        fingerprint: {
          tenant: withBrand('global', 'TenantId'),
          region: 'global',
          serviceFamily: 'recovery-strategy',
          impactClass: 'application',
          estimatedRecoveryMinutes: 20,
        },
        effectiveAt: new Date().toISOString(),
      },
    ],
  });

  const commandSnapshots = useMemo(() => {
    return simulation.selected
      ? [
          {
            sessionId: `${simulation.selected.scenarioId}:surface`,
            tenant: 'global',
            generatedAt: new Date().toISOString(),
            entries: [],
            recommendation: simulation.selected.readinessState,
          },
        ]
      : [];
  }, [simulation.selected]);

  return (
    <main>
      <RecoveryOperationsOverviewPanel workspace={workspace} onRefresh={workspace.refresh} />
      <section>
        <h2>Strategy simulation ({simulation.simulations.length})</h2>
        <button type="button" onClick={workspace.refresh}>
          Recompute workspace
        </button>
        <RecoveryCommandSurfacePanel snapshots={commandSnapshots} title="Simulation Command Surfaces" />
      </section>
    </main>
  );
};
