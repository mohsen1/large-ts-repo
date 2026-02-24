import { ok, fail, type Result } from '@shared/result';
import { buildDraftPlan } from './planner';
import { assessPlan, makeDefaultConstraints } from './constraints';
import { buildTelemetrySnapshot } from './telemetry';
import { createInMemoryLogger, createInMemoryStore, createPlanEvaluator } from './adapters';
import type {
  CadenceCommand,
  CadenceDraft,
  CadencePlan,
  CadenceRuntimeIntent,
  CadenceWorkspaceState,
  FabricRunSnapshot,
  FabricSignal,
  FabricSignalEnvelope,
  FabricWorkspaceId,
} from './types';

export interface FabricCadenceService {
  loadState: (workspaceId: FabricWorkspaceId) => Promise<Result<CadenceWorkspaceState, Error>>;
  prepareDraft: (workspaceId: FabricWorkspaceId, command: CadenceCommand) => Promise<Result<CadenceDraft, Error>>;
  executePlan: (plan: CadencePlan, intent: CadenceRuntimeIntent) => Promise<Result<FabricRunSnapshot, Error>>;
}

const createDemoState = (workspaceId: FabricWorkspaceId): CadenceWorkspaceState => ({
  workspaceId,
  tenant: {
    tenantId: workspaceId,
    region: 'us-east-1',
    environment: 'prod',
  },
  nodeCatalog: [
    {
      nodeId: 'node:catalog-a',
      name: 'catalog-a',
      region: 'us-east-1',
      criticality: 0.81,
      dependencies: [],
    },
    {
      nodeId: 'node:catalog-b',
      name: 'catalog-b',
      region: 'us-east-1',
      criticality: 0.52,
      dependencies: [{ target: 'node:catalog-a', weight: 0.9, mandatory: true }],
    },
  ],
});

const toSignalEnvelopes = (state: CadenceWorkspaceState): readonly FabricSignalEnvelope[] =>
  state.nodeCatalog.map((node) => ({
    signal: {
      signalId: `signal:${node.nodeId}` as const,
      source: node.region,
      category: 'dependency',
      weight: node.criticality,
      intensity: node.criticality,
      createdAt: new Date().toISOString(),
      tags: [node.name],
    },
    signalRatePerMinute: 1,
    historicalConfidence: 0.87,
    notes: ['fabric', 'derived'],
  }));

export const createFabricCadenceService = (): FabricCadenceService => {
  const store = createInMemoryStore();
  const logger = createInMemoryLogger();
  const evaluator = createPlanEvaluator();

  const loadState = async (workspaceId: FabricWorkspaceId): Promise<Result<CadenceWorkspaceState, Error>> => {
    if (!workspaceId) {
      return fail(new Error('invalid workspace'));
    }
    return ok(createDemoState(workspaceId));
  };

  const prepareDraft = async (workspaceId: FabricWorkspaceId, command: CadenceCommand): Promise<Result<CadenceDraft, Error>> => {
    const state = createDemoState(workspaceId);
    const signals = toSignalEnvelopes(state);
    const built = buildDraftPlan({ state, command, signals }, makeDefaultConstraints(workspaceId));

    const violations = assessPlan(built.plan);
    if (!evaluator.validatePlan(built.plan) || violations.length !== 0) {
      return fail(new Error('plan validation failed'));
    }

    await store.saveDraft(built.draft);
    logger.pushEvent(workspaceId, 'plan-created', { planId: built.plan.planId });

    return ok({
      ...built.draft,
      violations: built.draft.violations.filter((violation) => violation.severity !== 'low'),
    });
  };

  const executePlan = async (plan: CadencePlan, intent: CadenceRuntimeIntent): Promise<Result<FabricRunSnapshot, Error>> => {
    if (!plan.windows.length || !evaluator.validatePlan(plan)) {
      return fail(new Error('invalid plan'));
    }

    const telemetry = buildTelemetrySnapshot(plan);
    const now = new Date();
    const expectedEndAt =
      telemetry.avgSpanMs > 0
        ? new Date(now.getTime() + telemetry.avgSpanMs * plan.windows.length).toISOString()
        : new Date(now.getTime()).toISOString();

    const snapshot: FabricRunSnapshot = {
      runId: `run:${plan.planId}` as const,
      planId: plan.planId,
      startedAt: now.toISOString(),
      expectedEndAt,
      activeWindowId: plan.windows[0]?.windowId,
      signalCount: plan.nodeOrder.length,
      throughput: intent.confidence,
      completedWindows: plan.windows.slice(0, Math.min(2, plan.windows.length)).map((window) => window.windowId),
    };

    logger.pushEvent(plan.workspaceId, 'plan-executed', { runId: snapshot.runId });
    return ok(snapshot);
  };

  return {
    loadState,
    prepareDraft,
    executePlan,
  };
};

export const buildPlanFromSignals = (workspaceId: string, command: CadenceCommand, _signals: readonly FabricSignal[]): ReturnType<typeof buildDraftPlan> =>
  buildDraftPlan({
    state: createDemoState(workspaceId as any),
    command,
    signals: [],
  });
