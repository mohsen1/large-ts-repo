import { useMemo } from 'react';
import { withBrand } from '@shared/core';

import { useRecoveryConsoleTelemetry, type SimulationRecordFilter } from '../hooks/useRecoveryConsoleTelemetry';
import { SimulationScenarioBoard } from '../components/SimulationScenarioBoard';
import { RecoveryOperationsControlPanel } from '../components/RecoveryOperationsControlPanel';
import { ScenarioRiskHeatmap } from '../components/ScenarioRiskHeatmap';
import { useRecoverySimulationWorkspace } from '../hooks/useRecoverySimulationWorkspace';
import {
  RecoveryProgram,
  type RecoveryProgramId,
  type RecoveryWindow,
  type RecoveryTopology,
} from '@domain/recovery-orchestration';
import {
  type RecoveryWindowToken,
  type RecoveryScenarioId,
  type RecoveryRunId,
  type RecoverySimulationId,
} from '@domain/recovery-simulation-planning';

interface RecoverySimulationWorkspacePageProps {
  readonly workspaceId: string;
  readonly tenant: string;
  readonly simulationFilter?: SimulationRecordFilter;
}

export const RecoverySimulationWorkspacePage = ({
  workspaceId,
  tenant,
  simulationFilter,
}: RecoverySimulationWorkspacePageProps) => {
  const telemetry = useRecoveryConsoleTelemetry({ simulations: [], filter: simulationFilter });
  const simulationState = useRecoverySimulationWorkspace(simulationFilter ?? {});

  useMemo(() => {
    return simulationState.simulations.reduce<Record<string, typeof simulationState.simulations[number]>>(
      (acc, summary) => {
        acc[summary.id] = summary;
        return acc;
      },
      {},
    );
  }, [simulationState.simulations]);

  const activeWorkspace = {
    scenarioId: withBrand(`${workspaceId}:scenario`, 'RecoveryScenarioId') as RecoveryScenarioId,
    runId: withBrand(workspaceId, 'RecoveryRunId') as RecoveryRunId,
    token: withBrand(`${tenant}:${workspaceId}`, 'RecoveryWindowToken') as RecoveryWindowToken,
    activeStepIds: simulationState.simulations.flatMap((item) => item.recommendedActions),
    disabledStepIds: [],
    createdAt: new Date().toISOString(),
  } as const;

  const topology: RecoveryTopology = {
    rootServices: [],
    fallbackServices: [],
    immutableDependencies: [],
  };

  const window: RecoveryWindow = {
    startsAt: activeWorkspace.createdAt,
    endsAt: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
    timezone: 'UTC',
  };

  const program: RecoveryProgram = {
    id: withBrand(`${workspaceId}:program`, 'RecoveryProgramId') as RecoveryProgramId,
    tenant: withBrand(tenant, 'TenantId'),
    service: withBrand('simulated-service', 'ServiceId'),
    name: 'Dry run',
    description: 'auto-generated workspace simulation',
    priority: 'gold',
    mode: 'restorative',
    window,
    topology,
    constraints: [],
    steps: [],
    owner: tenant,
    tags: [],
    createdAt: activeWorkspace.createdAt,
    updatedAt: activeWorkspace.createdAt,
  };

  const handleRun = async () => {
    await simulationState.run(activeWorkspace, program);
  };

  return (
    <main className="simulation-workspace-page">
      <header>
        <h2>Recovery simulation workspace</h2>
        <p>tenant: {tenant}</p>
      </header>
      <div className="panels">
        <SimulationScenarioBoard
          title="Recent summaries"
          summaries={simulationState.simulations}
          workspace={activeWorkspace}
          onSelect={() => undefined}
        />
        <RecoveryOperationsControlPanel
          running={simulationState.busy}
          summary={simulationState.selected}
          diagnostics={simulationState.diagnostics}
          onRun={handleRun}
          onReset={simulationState.clear}
        />
        <ScenarioRiskHeatmap diagnostics={simulationState.diagnostics} />
      </div>
      <section>
        <pre>
          {telemetry.recent.map((summary) => (
            <code key={summary.id}>
              {summary.id}: {summary.score}
            </code>
          ))}
        </pre>
      </section>
    </main>
  );
};
