import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import { InMemoryRecoverySimulationStore } from '@data/recovery-simulation-store/src/repository';
import { RecoverySimulationOrchestrator } from '@service/recovery-simulation-orchestrator';
import type {
  SimulationActorId,
  SimulationCommand,
  SimulationPlanId,
  SimulationRunId,
  SimulationRunRecord,
} from '@domain/recovery-simulation-core';
import type {
  RecoverySimulationLabResult,
  SimulationBandSignal,
  SimulationLabBlueprint,
  SimulationPlanDraft,
} from '@domain/recovery-simulation-lab-models';
import { buildSimulationPlan } from '@domain/recovery-simulation-lab-models/src/planner';
import { defaultLabBlueprint, defaultLabDraft } from '@domain/recovery-simulation-lab-models/src/catalog';
import { summarizeResult, buildSummaryLines } from '@domain/recovery-simulation-lab-models/src/analysis';

interface UseRecoverySimulationLabState {
  readonly blueprint: SimulationLabBlueprint;
  readonly draft: SimulationPlanDraft;
  readonly planResult?: RecoverySimulationLabResult;
  readonly selectedBand?: SimulationBandSignal['band'];
  readonly selectedCommandIndex: number;
  readonly runStatus: 'idle' | 'building' | 'ready' | 'running' | 'failed' | 'completed';
  readonly statusMessage?: string;
}

type Action =
  | { type: 'set-band'; band: SimulationBandSignal['band'] }
  | { type: 'set-draft'; draft: SimulationPlanDraft }
  | { type: 'set-command-index'; index: number }
  | { type: 'set-plan'; result: RecoverySimulationLabResult }
  | { type: 'set-status'; status: UseRecoverySimulationLabState['runStatus']; message?: string }
  | { type: 'set-error'; message: string };

const reducer = (state: UseRecoverySimulationLabState, action: Action): UseRecoverySimulationLabState => {
  switch (action.type) {
    case 'set-band': {
      return { ...state, selectedBand: action.band };
    }
    case 'set-draft': {
      return { ...state, draft: action.draft };
    }
    case 'set-command-index': {
      return { ...state, selectedCommandIndex: action.index };
    }
    case 'set-plan': {
      return {
        ...state,
        planResult: action.result,
        runStatus: 'ready',
        statusMessage: 'plan built',
      };
    }
    case 'set-status': {
      return { ...state, runStatus: action.status, statusMessage: action.message };
    }
    case 'set-error': {
      return { ...state, runStatus: 'failed', statusMessage: action.message };
    }
    default:
      return state;
  }
};

export const useRecoverySimulationLab = (tenantId: string) => {
  const [state, dispatch] = useReducer(reducer, {
    blueprint: defaultLabBlueprint(`blueprint-${tenantId}`),
    draft: defaultLabDraft(`blueprint-${tenantId}`),
    runStatus: 'idle',
    selectedCommandIndex: 0,
  });
  const [errors, setErrors] = useState<string[]>([]);

  const repository = useMemo(() => new InMemoryRecoverySimulationStore(), []);
  const orchestrator = useMemo(() => new RecoverySimulationOrchestrator({ repository }), [repository]);

  const commands: readonly SimulationCommand[] = useMemo(() => {
    const planResult = state.planResult;
    if (!planResult) {
      return [];
    }
    return planResult.ledger.commandHistory.map((entry, index) => ({
      requestId: `${planResult.projection.draftId}:cmd:${index}`,
      runId: `${planResult.projection.draftId}:run` as SimulationRunId,
      actorId: entry as SimulationActorId,
      command: 'start',
      requestedAt: new Date().toISOString(),
    }));
  }, [state.planResult]);

  const run = useMemo<SimulationRunRecord | undefined>(() => {
    if (!state.planResult || state.planResult.ledger.events.length === 0) {
      return undefined;
    }

    const draftId = state.planResult.projection.draftId;
    return {
      id: `${tenantId}:run:${draftId}` as unknown as SimulationRunRecord['id'],
      planId: `${tenantId}:plan:${draftId}` as unknown as SimulationRunRecord['planId'],
      scenarioId: `${tenantId}:scenario:${draftId}` as unknown as SimulationRunRecord['scenarioId'],
      createdAt: new Date().toISOString(),
      state: 'queued',
      startedAt: new Date().toISOString(),
      executedSteps: [],
      incidentsDetected: 0,
      residualRiskScore: state.planResult.estimate.residualRisk,
    };
  }, [state.planResult, tenantId]);

  const summary = useMemo(() => state.planResult && summarizeResult(state.planResult), [state.planResult]);
  const summaryLines = useMemo(() => (summary ? buildSummaryLines(summary) : []), [summary]);

  const buildPlan = useCallback(() => {
    dispatch({ type: 'set-status', status: 'building', message: 'building draft plan' });
    try {
      const result = buildSimulationPlan(
        {
          blueprint: state.blueprint,
          draft: state.draft,
        },
        { enforceCapacity: true, includeWarnings: true },
      );
      dispatch({ type: 'set-plan', result });
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors((previous) => [...previous, message]);
      dispatch({ type: 'set-error', message });
      return false;
    }
  }, [state.blueprint, state.draft]);

  const runSimulation = useCallback(async () => {
    if (state.runStatus === 'running') {
      return;
    }

    if (!state.planResult) {
      const ok = buildPlan();
      if (!ok) {
        return;
      }
    }

    dispatch({ type: 'set-status', status: 'running', message: 'launching simulation' });
    try {
      const request = {
        planId: `${tenantId}:plan:${state.draft.blueprintId}` as SimulationPlanId,
        operatorId: state.draft.requestedBy,
        commands,
      };

      const manifest = await orchestrator.runManifest(request.planId);
      if (manifest.ok === false) {
        throw manifest.error;
      }

      const runId = manifest.value.runId as unknown as SimulationRunRecord['id'];
      if (run) {
        void runId;
      }

      const commandBatch = await orchestrator.executeBatch(request);
      if (commandBatch.ok === false) {
        throw commandBatch.error;
      }

      dispatch({ type: 'set-status', status: 'completed', message: commandBatch.value.summary });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setErrors((previous) => [...previous, message]);
      dispatch({ type: 'set-error', message });
    }
  }, [commands, orchestrator, state.blueprint.id, state.draft, state.planResult, state.runStatus, tenantId, buildPlan]);

  const setBand = (band: SimulationBandSignal['band']) => dispatch({ type: 'set-band', band });
  const setDraft = (draft: SimulationPlanDraft) => dispatch({ type: 'set-draft', draft });
  const setSelectedCommandIndex = (index: number) => dispatch({ type: 'set-command-index', index });

  useEffect(() => {
    dispatch({ type: 'set-status', status: 'idle', message: `tenant=${tenantId}` });
  }, [tenantId]);

  return {
    blueprint: state.blueprint,
    draft: state.draft,
    selectedBand: state.selectedBand,
    runStatus: state.runStatus,
    statusMessage: state.statusMessage,
    errors,
    commands,
    selectedCommandIndex: state.selectedCommandIndex,
    planResult: state.planResult,
    summary,
    summaryLines,
    run,
    setBand,
    setDraft,
    setSelectedCommandIndex,
    buildPlan,
    runSimulation,
  };
};
