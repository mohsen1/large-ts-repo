import {
  AUTONOMY_SCOPE_SEQUENCE,
  type AutonomyScope,
  type AutonomyPlan,
  type AutonomySignalInput,
  type AutonomySignalEnvelope,
  asGraphId,
  asPlanId,
  asRunId,
  asRequestId,
  scopeTuple,
} from './models';
import type { AutonomyPluginRegistry, PluginContext } from './registry';
import type { NoInfer, Brand } from '@shared/type-level';
import { withBrand } from '@shared/core';

type AutonomyWindowSignature = Brand<string, 'AutonomyWindowSignature'>;

export type PlanWindow<T extends readonly AutonomyScope[]> = {
  readonly stages: T;
  readonly signature: AutonomyWindowSignature;
};

export interface BlueprintDiagnostics {
  readonly id: string;
  readonly stageCount: number;
  readonly chain: readonly AutonomyScope[];
  readonly ordered: readonly string[];
}

export interface PlannerRequest {
  readonly tenantId: string;
  readonly graphId: string;
  readonly stages?: readonly AutonomyScope[];
  readonly seed: string;
}

export const buildWindow = <T extends readonly AutonomyScope[]>(stages: T): PlanWindow<T> => ({
  stages,
  signature: withBrand(`signature:${stages.join('>')}`, 'AutonomyWindowSignature'),
});

export const normalizeWindow = <T extends readonly AutonomyScope[]>(stages: T): T => {
  const discovered = new Set(stages);
  const merged = [...AUTONOMY_SCOPE_SEQUENCE.filter((scope) => discovered.has(scope)), ...stages];
  return [...new Set(merged)] as unknown as T;
};

export const buildBlueprint = <TStages extends readonly AutonomyScope[]>(
  runId: string,
  graphId: string,
  stages: NoInfer<TStages>,
): AutonomyPlan<TStages> => {
  const normalized = normalizeWindow(stages);
  const staged = normalized as unknown as TStages;
  return {
    planId: asPlanId(`plan:${runId}:${graphId}`),
    scopeTuple: scopeTuple(staged),
    stages: staged,
    expectedDurations: staged.map((_, index) => 180 + (index + 1) * 33),
    createdAt: new Date().toISOString(),
  };
};

export const defaultWindow = (): PlanWindow<typeof AUTONOMY_SCOPE_SEQUENCE> => ({
  stages: AUTONOMY_SCOPE_SEQUENCE,
  signature: withBrand(`signature:${AUTONOMY_SCOPE_SEQUENCE.join('>')}`, 'AutonomyWindowSignature'),
});

export const buildBlueprintDiagnostics = <T extends AutonomyScope[]>(
  plan: AutonomyPlan<T>,
  registry: AutonomyPluginRegistry,
): BlueprintDiagnostics => {
  const ordered = [...new Set(plan.stages.flatMap((scope) => registry.byScope(scope).map((plugin) => String(plugin.id))))];
  return {
    id: String(plan.planId),
    stageCount: plan.stages.length,
    chain: [...plan.stages],
    ordered,
  };
};

export type StageSignal<TScope extends AutonomyScope = AutonomyScope> = {
  readonly scope: TScope;
  readonly signals: readonly AutonomySignalEnvelope<TScope>[];
};

export const buildContext = (
  request: PlannerRequest,
  scope: AutonomyScope,
): PluginContext => ({
  tenantId: request.tenantId,
  runId: asRunId(request.seed),
  graphId: asGraphId(request.graphId),
  scope,
  requestId: asRequestId(`request:${request.seed}:${scope}:${Date.now()}`),
  startedAt: new Date().toISOString(),
  labels: {
    tenantId: request.tenantId,
    graphId: request.graphId,
    seed: request.seed,
    scope,
  },
});

export const buildSignalInputs = <T extends readonly AutonomyScope[]>(
  plan: AutonomyPlan<T>,
  runId: string,
  graphId: string,
  tenant: string,
): readonly AutonomySignalInput<AutonomyScope>[] => {
  const normalized = normalizeWindow(plan.stages);
  return normalized.map((scope, index) => ({
    scope,
    graphId: asGraphId(graphId),
    runId: asRunId(runId),
    source: `${tenant}:${scope}:${index}`,
    payload: { scope, index },
    channel: 'telemetry',
    tags: [tenant, scope, String(index)],
  }));
};

export const summarizePlanSignals = (
  signals: readonly AutonomySignalEnvelope[],
): {
  readonly scopeCount: number;
  readonly byScope: Record<AutonomyScope, number>;
} => {
  const byScope = signals.reduce<Record<AutonomyScope, number>>((acc, signal) => {
    acc[signal.scope] = (acc[signal.scope] ?? 0) + 1;
    return acc;
  }, {} as Record<AutonomyScope, number>);

  return {
    scopeCount: Object.keys(byScope).length,
    byScope,
  };
};
