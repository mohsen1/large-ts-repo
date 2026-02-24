import { fail, ok, type Result } from '@shared/result';
import type {
  FabricCadenceOrchestrator,
  OrchestratorError,
  OrchestrationOutcome,
} from './types';
import { createFabricCadenceService, type CadenceWorkspaceId, type FabricCadenceService } from '@domain/recovery-fabric-cadence-core';
import {
  findDraft,
  storeDraft,
  closeWorkspace,
  createRuntime,
  isWorkspaceClosed,
  recordRunStart,
  getRunDurationMs,
  type RuntimeRuntime,
} from './memoryRuntime';
import { buildForecastFromPlan } from '@domain/recovery-fabric-cadence-core';
import { validateCommand, validatePlanId, commandWindowCount } from './validators';
import { summarizeOutcome, summarizeRun, telemetrySnapshot } from './analytics';
import { makeReport, summarizeRows } from './reporter';
import type {
  CadenceCommand,
  CadenceRuntimeIntent,
  CadenceWorkspaceState,
  CadenceDraft,
} from '@domain/recovery-fabric-cadence-core';
import { evaluateHealth } from '@domain/recovery-fabric-cadence-core';

export const createCadenceOrchestrator = (): FabricCadenceOrchestrator => {
  const runtime: RuntimeRuntime = createRuntime();
  const service: FabricCadenceService = createFabricCadenceService();

  const enrichState = (state: CadenceWorkspaceState, command: CadenceCommand, draft?: CadenceDraft) => {
    const activePlan = draft?.candidatePlan ?? state.activePlan;
    const latestForecast = activePlan ? buildForecastFromPlan(activePlan) : undefined;
    return {
      ...state,
      activePlan,
      latestForecast,
      lastHealth: activePlan ? evaluateHealth({
        runId: `run:${activePlan.planId}` as const,
        planId: activePlan.planId,
        startedAt: new Date().toISOString(),
        expectedEndAt: new Date().toISOString(),
        signalCount: activePlan.nodeOrder.length,
        throughput: activePlan.metadata.requestedThroughput,
        completedWindows: [],
      }, command.mode) : state.lastHealth,
    };
  };

  const executeWithTiming = async (
    run: () => Promise<Result<OrchestrationOutcome, OrchestratorError>>,
  ): Promise<{ outcome: Result<OrchestrationOutcome, OrchestratorError>; elapsedMs: number }> => {
    const started = Date.now();
    const outcome = await run();
    return { outcome, elapsedMs: Date.now() - started };
  };

  const loadState = async (workspaceId: CadenceWorkspaceId) => {
    if (!workspaceId) {
      return fail({ code: 'invalid-command', message: 'workspaceId missing' } as OrchestratorError);
    }
    const stateResult = await service.loadState(workspaceId);
    if (!stateResult.ok) {
      return fail({ code: 'not-found', message: stateResult.error.message } as OrchestratorError);
    }
    return ok(stateResult.value);
  };

  const buildDraft = async (
    workspaceId: CadenceWorkspaceId,
    command: CadenceCommand,
  ): Promise<Result<OrchestrationOutcome, OrchestratorError>> => {
    if (isWorkspaceClosed(runtime, workspaceId)) {
      return fail({ code: 'execution-failed', message: 'workspace closed' });
    }

    const commandValidation = validateCommand(command);
    if (!commandValidation.ok) {
      return fail(commandValidation.error);
    }

    const stateResult = await service.loadState(workspaceId);
    if (!stateResult.ok) {
      return fail({ code: 'not-found', message: stateResult.error.message });
    }

    const draftResult = await service.prepareDraft(workspaceId, command);
    if (!draftResult.ok) {
      return fail({ code: 'planner-failure', message: draftResult.error.message });
    }

    storeDraft(runtime, draftResult.value);

    const nextState = enrichState(stateResult.value, command, draftResult.value);
    const outcome: OrchestrationOutcome = {
      verb: 'plan',
      workspaceId,
      draft: draftResult.value,
      plan: draftResult.value.candidatePlan,
      state: nextState,
      metrics: {
        windowCount: draftResult.value.candidatePlan.windows.length,
        activeSignals: commandWindowCount(command),
        elapsedMs: 0,
      },
    };

    return ok(outcome);
  };

  const executeDraft = async (
    workspaceId: CadenceWorkspaceId,
    draftId: string,
  ): Promise<Result<OrchestrationOutcome, OrchestratorError>> => {
    const draftResult = findDraft(runtime, workspaceId, draftId);
    if (!draftResult.ok) {
      return fail({ code: 'not-found', message: draftResult.error.message });
    }

    const validation = validatePlanId(draftResult.value.candidatePlan.planId);
    if (!validation.ok) {
      return fail(validation.error);
    }

    const intent: CadenceRuntimeIntent = {
      intentId: `intent:${draftId}` as const,
      tenantId: workspaceId,
      description: `execute ${draftId}`,
      acceptedSignals: draftResult.value.candidatePlan.nodeOrder.map((nodeId) => `signal:${nodeId}` as const),
      blockedSignals: [],
      confidence: Math.min(0.99, Math.max(0.05, draftResult.value.candidatePlan.nodeOrder.length / 20)),
      requestedAt: new Date().toISOString(),
    };

    const stateResult = await service.loadState(workspaceId);
    if (!stateResult.ok) {
      return fail({ code: 'not-found', message: stateResult.error.message });
    }

    const executeResult = await executeWithTiming(async () => {
      const planExecution = await service.executePlan(draftResult.value.candidatePlan, intent);
      if (!planExecution.ok) {
        return fail({ code: 'execution-failed', message: planExecution.error.message });
      }

      recordRunStart(runtime, planExecution.value.runId);
      const summary = summarizeRun(planExecution.value);

      const state: CadenceWorkspaceState = {
        ...stateResult.value,
        activePlan: draftResult.value.candidatePlan,
        activeRun: planExecution.value,
        latestForecast: buildForecastFromPlan(draftResult.value.candidatePlan),
        lastHealth: {
          signalCoverage: summary.score,
          riskBand: summary.riskBand,
          overloadedNodes: planExecution.value.completedWindows.map((completedWindowId) => `node:${completedWindowId.split(':')[1]}` as const),
          blockedDependencies: [],
        },
      };

      const outcome: OrchestrationOutcome = {
        verb: 'execute',
        workspaceId,
        plan: draftResult.value.candidatePlan,
        state,
        snapshot: planExecution.value,
        metrics: {
          windowCount: draftResult.value.candidatePlan.windows.length,
          activeSignals: draftResult.value.candidatePlan.nodeOrder.length,
          elapsedMs: 0,
        },
      };

      void summarizeOutcome(outcome);
      const report = makeReport(outcome);
      void summarizeRows(report.rows);
      void telemetrySnapshot(state, draftResult.value.candidatePlan);

      return ok(outcome);
    });

    if (!executeResult.outcome.ok) {
      return fail(executeResult.outcome.error);
    }

    return ok({
      ...executeResult.outcome.value,
      metrics: {
        ...executeResult.outcome.value.metrics,
        elapsedMs: executeResult.elapsedMs,
      },
    });
  };

  const closeAll = async (workspaceId: CadenceWorkspaceId): Promise<Result<void, OrchestratorError>> => {
    if (!workspaceId) {
      return fail({ code: 'invalid-command', message: 'workspaceId missing' });
    }
    closeWorkspace(runtime, workspaceId);
    return ok(undefined);
  };

  return {
    loadState,
    buildDraft,
    executeDraft,
    closeAll,
  };
};

export type CadenceRun = ReturnType<FabricCadenceOrchestrator['executeDraft']>;
