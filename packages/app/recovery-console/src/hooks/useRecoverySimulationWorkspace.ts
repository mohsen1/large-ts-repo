import { useCallback, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';

import { deriveRunDiagnostics, type RunDiagnostics } from '@service/recovery-runner';
import {
  parseSimulationProfile,
  runAndEmitSimulationEvents,
  type RecoveryRunId,
  type RecoverySimulationId,
  type ScenarioStep,
  type SimulationInput,
  type SimulationSummary,
  type SimulationWorkspace,
} from '@domain/recovery-simulation-planning';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import { buildSimulationRecord, type SimulationRecordFilter } from './useRecoveryConsoleTelemetry';

export interface UseRecoverySimulationWorkspaceResult {
  readonly simulations: readonly SimulationSummary[];
  readonly selected?: SimulationSummary;
  readonly workspace?: SimulationWorkspace;
  readonly diagnostics?: RunDiagnostics;
  readonly busy: boolean;
  readonly error?: string;
  readonly run: (workspace: SimulationWorkspace, program: RecoveryProgram) => Promise<void>;
  readonly clear: () => void;
}

const toProfileSteps = (steps: readonly RecoveryProgram['steps'][number][]) =>
  steps.map((step): ScenarioStep => ({
    id: step.id,
    phase: 'recovery',
    title: step.title,
    command: step.command,
    expectedMinutes: Math.max(1, Math.round(step.timeoutMs / 60000)),
    dependencies: step.dependencies,
    constraints: [],
  }));

const buildSimulationInput = (workspace: SimulationWorkspace, program: RecoveryProgram): SimulationInput => {
  return {
    profile: parseSimulationProfile({
      id: withBrand(`${workspace.runId}:sim`, 'RecoverySimulationId'),
      scenario: {
        id: withBrand(`${program.id}:workspace`, 'RecoveryScenarioId'),
        tenant: withBrand(`${program.tenant}`, 'TenantId'),
        owner: `${workspace.token}`,
        title: `Workspace ${workspace.scenarioId}`,
        window: {
          startAt: new Date().toISOString(),
          endAt: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
          timezone: 'UTC',
        },
        steps: toProfileSteps(program.steps),
        rules: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      runId: withBrand(`${workspace.runId}`, 'RecoveryRunId'),
      region: 'global',
      blastRadiusScore: 0.35,
      targetRtoMinutes: 25,
      targetRpoMinutes: 1,
      concurrencyCap: Math.max(1, program.topology?.rootServices.length ?? 1),
    }),
    now: new Date().toISOString(),
    dryRun: true,
  };
};

export const useRecoverySimulationWorkspace = (
  filter: SimulationRecordFilter = {},
): UseRecoverySimulationWorkspaceResult => {
  const [simulations, setSimulations] = useState<SimulationSummary[]>([]);
  const [selected, setSelected] = useState<SimulationSummary | undefined>(undefined);
  const [workspace, setWorkspace] = useState<SimulationWorkspace | undefined>(undefined);
  const [diagnostics, setDiagnostics] = useState<RunDiagnostics | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const run = useCallback(async (currentWorkspace: SimulationWorkspace, program: RecoveryProgram) => {
    setBusy(true);
    setError(undefined);
    try {
      const simulationInput = buildSimulationInput(currentWorkspace, program);
      const simulationResult = runAndEmitSimulationEvents(simulationInput);
      if (!simulationResult.ok) {
        setError(simulationResult.error.message);
        return;
      }

      const summary = simulationResult.value.summary;
      const next = [summary, ...simulations].slice(0, 20);
      const nextDiagnostics = deriveRunDiagnostics(
        currentWorkspace.runId,
        summary,
        simulationResult.value.workspace,
        simulationResult.value.telemetry,
      );

      setSimulations(next);
      setSelected(summary);
      setWorkspace(currentWorkspace);
      setDiagnostics(nextDiagnostics);
      void buildSimulationRecord(next, filter);
    } finally {
      setBusy(false);
    }
  }, [filter, simulations]);

  const clear = useCallback(() => {
    setSimulations([]);
    setSelected(undefined);
    setWorkspace(undefined);
    setDiagnostics(undefined);
    setError(undefined);
  }, []);

  const memoWorkspace = useMemo(() => workspace, [workspace]);
  return useMemo(() => ({
      simulations,
      selected,
      workspace: memoWorkspace,
      diagnostics,
      busy,
      error,
      run,
      clear,
    }),
    [simulations, selected, memoWorkspace, diagnostics, busy, error, run, clear],
  );
};
