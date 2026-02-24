import type {
  PluginStage,
  HorizonPlan,
  HorizonSignal,
  JsonLike,
  TimeMs,
} from '@domain/recovery-horizon-engine';
import { buildLifecycleGraph } from '@domain/recovery-horizon-engine/graph-lifecycle';
import { createAnalytics } from '@data/recovery-horizon-store/analytics';
import { createRepository, type RecoveryHorizonRepository } from '@data/recovery-horizon-store';
import type { Result } from '@shared/result';
import { err, ok } from '@shared/result';
import { runLabWithHorizonGraph } from './lab-orchestrator';

interface TimelineEnvelope {
  readonly tenantId: string;
  readonly stage: PluginStage;
  readonly planIds: readonly string[];
  readonly startedAt: TimeMs;
}

interface InspectorWindow {
  readonly tenantId: string;
  readonly signalCount: number;
  readonly planCount: number;
  readonly stages: readonly PluginStage[];
  readonly matrix: { readonly [K in PluginStage]: number };
}

export type { TimelineEnvelope };

const toPlanPayload = (plan: HorizonPlan): { readonly stages?: readonly PluginStage[] } => (
  (plan.payload as { readonly stages?: readonly PluginStage[] } | undefined) ?? {}
);

const toCursor = (tenantId: string, plan: HorizonPlan): TimelineEnvelope => ({
  tenantId,
  stage: toPlanPayload(plan).stages?.[0] ?? 'ingest',
  planIds: plan.id ? [plan.id] : [],
  startedAt: nowMs(),
});

const nowMs = (): TimeMs => Date.now() as TimeMs;

export const summarizeTenant = async (
  tenantId: string,
  repository: RecoveryHorizonRepository,
  stageWindow: readonly PluginStage[],
): Promise<Result<InspectorWindow>> => {
  const analytics = createAnalytics(repository);
  const window = await analytics.readTenantWindow(tenantId, {
    tenantId,
    stages: stageWindow,
    includeArchived: true,
    maxRows: 500,
  });

  if (!window.ok) {
    return err(window.error);
  }

  const stages = await analytics.summarizeStages(tenantId, {
    tenantId,
    stages: stageWindow,
    includeArchived: true,
    maxRows: 500,
  });
  if (!stages.ok) {
    return err(stages.error);
  }

  return ok({
    tenantId,
    signalCount: window.value.signalCount,
    planCount: window.value.planCount,
    stages: stageWindow,
    matrix: {
      ingest: stages.value.matrix.ingest,
      analyze: stages.value.matrix.analyze,
      resolve: stages.value.matrix.resolve,
      optimize: stages.value.matrix.optimize,
      execute: stages.value.matrix.execute,
    },
  });
};

export const timelineFromSignals = (
  tenantId: string,
  signals: readonly HorizonSignal<PluginStage, JsonLike>[],
): readonly TimelineEnvelope[] => {
  const buckets = new Map<PluginStage, TimelineEnvelope>();
  for (const signal of signals) {
    const existing = buckets.get(signal.kind);
    if (existing) {
      buckets.set(signal.kind, {
        tenantId,
        stage: signal.kind,
        planIds: [...existing.planIds, signal.input.runId],
        startedAt: existing.startedAt,
      });
    } else {
      buckets.set(signal.kind, {
        tenantId,
        stage: signal.kind,
        planIds: [signal.input.runId],
        startedAt: nowMs(),
      });
    }
  }

  return [...buckets.values()];
};

export const inspectGraph = async (
  tenantId: string,
  stageWindow: readonly PluginStage[],
): Promise<Result<number>> => {
  return runLabWithHorizonGraph(tenantId, stageWindow);
};

export const cursorFromPlans = (
  tenantId: string,
  plans: readonly HorizonPlan[],
): readonly TimelineEnvelope[] => {
  const cursor = plans.map((plan) => toCursor(tenantId, plan));
  return cursor;
};

export const inspectTenantDelta = async (
  tenantA: string,
  tenantB: string,
): Promise<Result<{ readonly delta: number; readonly ratio: number }>> => {
  const repository = createRepository(tenantA, tenantB);
  const left = await summarizeTenant(tenantA, repository, ['ingest', 'analyze', 'resolve', 'optimize', 'execute']);
  const right = await summarizeTenant(tenantB, repository, ['ingest', 'analyze', 'resolve', 'optimize', 'execute']);
  if (!left.ok || !right.ok) {
    return err(new Error('inspection failed'));
  }

  const delta = right.value.signalCount - left.value.signalCount;
  const ratio = left.value.signalCount === 0 ? 0 : (delta / left.value.signalCount) * 100;
  return ok({ delta, ratio });
};
