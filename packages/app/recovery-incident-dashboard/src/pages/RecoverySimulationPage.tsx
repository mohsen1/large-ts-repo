import { useMemo } from 'react';
import { useRecoverySimulation } from '../hooks/useRecoverySimulation';
import { SimulationPlanCard } from '../components/simulation/SimulationPlanCard';
import { SimulationRunTimeline } from '../components/simulation/SimulationRunTimeline';
import { SimulationCommandPanel } from '../components/simulation/SimulationCommandPanel';
import type {
  SimulationActorId,
  SimulationScenarioBlueprint,
  SimulationCommand,
  SimulationScenarioId,
} from '@domain/recovery-simulation-core';
import type { RecoverySimulationOrchestrator } from '@service/recovery-simulation-orchestrator';

const DEMO_SCENARIO: SimulationScenarioBlueprint = {
  id: 'demo-scenario' as SimulationScenarioId,
  title: 'Recovery simulation drill',
  description: 'Simulates multi-step recovery playbook execution for stress coverage.',
  severity: 'high',
  owner: 'platform',
  tags: ['simulation', 'orchestration'],
  targets: [
    {
      id: 'target-api' as any,
      label: 'api-gateway',
      region: 'us-east-1',
      serviceClass: 'critical',
      owner: 'platform-team',
      dependencies: [],
    },
  ],
  steps: [
    {
      id: 'step-initialize' as any,
      title: 'Initialize simulation context',
      targetId: 'target-api' as any,
      expectedDurationMs: 4_000,
      requiredActors: ['actor-ops' as SimulationActorId],
      tags: ['bootstrap'],
      riskSurface: 'app',
      recoveryCriticality: 5,
      dependsOn: [],
    },
    {
      id: 'step-verify' as any,
      title: 'Verify telemetry streams',
      targetId: 'target-api' as any,
      expectedDurationMs: 8_000,
      requiredActors: ['actor-ops' as SimulationActorId],
      tags: ['telemetry'],
      riskSurface: 'data',
      recoveryCriticality: 4,
      dependsOn: ['step-initialize' as any],
    },
  ],
};

export interface RecoverySimulationPageProps {
  readonly orchestrator: RecoverySimulationOrchestrator;
}

export const RecoverySimulationPage = ({ orchestrator }: RecoverySimulationPageProps) => {
  const {
    plan,
    runs,
    selectedRunId,
    setSelectedRunId,
    refresh,
    runCommand,
    historySummary,
  } = useRecoverySimulation({ orchestrator, defaultScenario: DEMO_SCENARIO });

  const planCards = useMemo(() => (plan ? [plan] : []), [plan]);

  const selectedRun = runs.find((item) => item.id === selectedRunId) ?? runs.at(-1);

  const canStart = selectedRun?.state !== 'completed' && selectedRun?.state !== 'executing';
  const canPause = selectedRun?.state === 'executing';
  const canResume = selectedRun?.state === 'stalled';
  const canAbort = selectedRun?.state === 'executing' || selectedRun?.state === 'stalled';

  const dispatchCommand = async (command: SimulationCommand['command']) => {
    if (!selectedRun) {
      return;
    }

    await runCommand({
      runId: selectedRun.id,
      actorId: selectedRun.scenarioId as any,
      command,
    });
  };

  return (
    <main className="recovery-simulation-page">
      <header>
        <h1>Recovery Simulation Console</h1>
        <p>{historySummary}</p>
        <button onClick={() => void refresh()}>Refresh</button>
      </header>
      <section className="simulation-grid">
        {planCards.map((entry) => (
          <SimulationPlanCard
            key={entry.id}
            plan={entry}
            selected={entry.id === plan?.id}
            onSelect={() => {
              return;
            }}
            onRun={() => {
              void dispatchCommand('start');
            }}
          />
        ))}
      </section>
      <section>
        <SimulationRunTimeline
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={setSelectedRunId}
        />
      </section>
      {selectedRun ? (
        <SimulationCommandPanel
          canStart={!!canStart}
          canPause={!!canPause}
          canResume={!!canResume}
          canAbort={!!canAbort}
          onStart={() => void dispatchCommand('start')}
          onPause={() => void dispatchCommand('pause')}
          onAbort={() => void dispatchCommand('abort')}
          onResume={() => void dispatchCommand('resume')}
        />
      ) : null}
    </main>
  );
};
