import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildManifest,
  materializeExecutionEntries,
  seedRunRecord,
  type SimulationActorId,
  type SimulationCommand,
  type SimulationPlanManifest,
  type SimulationRunRecord,
  type SimulationScenarioBlueprint,
} from '@domain/recovery-simulation-core';
import { RecoverySimulationOrchestrator } from '@service/recovery-simulation-orchestrator';

export interface RecoverySimulationState {
  readonly scenario: SimulationScenarioBlueprint;
  readonly plan: SimulationPlanManifest | null;
  readonly runs: readonly SimulationRunRecord[];
  readonly selectedRunId: string | null;
  readonly historySummary: string;
}

export interface UseRecoverySimulationOptions {
  readonly orchestrator: RecoverySimulationOrchestrator;
  readonly defaultScenario: SimulationScenarioBlueprint;
}

export const useRecoverySimulation = ({ orchestrator, defaultScenario }: UseRecoverySimulationOptions) => {
  const [scenario, setScenario] = useState<SimulationScenarioBlueprint>(defaultScenario);
  const [plan, setPlan] = useState<SimulationPlanManifest | null>(null);
  const [runs, setRuns] = useState<SimulationRunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const runManifest = useMemo(() => buildManifest(scenario, 'recovery-dashboard'), [scenario]);

  const refresh = useCallback(async () => {
    setPlan(runManifest.manifest);
    const runSeed = seedRunRecord(runManifest.manifest);
    setRuns([runSeed]);
    setSelectedRunId(runSeed.id);
    const response = await orchestrator.runManifest(runManifest.manifest.id);
    if (!response.ok) {
      return;
    }
    setSelectedRunId(response.value.runId);
  }, [orchestrator, runManifest]);

  const runCommand = useCallback(
    async (command: Omit<SimulationCommand, 'requestedAt' | 'requestId'>) => {
      const run = runs.find((entry) => entry.id === selectedRunId);
      if (!run) {
        return;
      }

      const issued: SimulationCommand = {
        requestId: `${run.id}:${Date.now()}`,
        runId: run.id,
        actorId: run.scenarioId as unknown as SimulationActorId,
        command: command.command,
        requestedAt: new Date().toISOString(),
      };

      const result = await orchestrator.runCommand(run, issued);
      if (!result.ok) {
        return;
      }

      setRuns((previous) => previous.map((entry) => (entry.id === result.value.id ? result.value : entry)));
    },
    [selectedRunId, runs, orchestrator],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const historySummary = useMemo(() => {
    const totalSteps = runs.reduce((sum, run) => sum + run.executedSteps.length, 0);
    const running = runs.filter((run) => run.state === 'executing').length;
    return `${runs.length} runs • ${totalSteps} steps • ${running} executing`;
  }, [runs]);

  return {
    scenario,
    plan,
    runs,
    selectedRunId,
    historySummary,
    setScenario,
    setSelectedRunId,
    refresh,
    runCommand,
  };
};
