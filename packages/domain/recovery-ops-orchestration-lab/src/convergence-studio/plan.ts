import { mapWithIteratorHelpers } from '@shared/type-level';
import type {
  ConvergencePluginDescriptor,
  ConvergencePlanId,
  ConvergenceRunId,
  ConvergenceStudioId,
  ConvergenceStage,
  ConvergenceLifecycle,
} from './types';
import { normalizeRunId, normalizeStudioId, normalizePlanId } from './types';

export interface PlanBlueprintStep {
  readonly plugin: ConvergencePluginDescriptor;
  readonly stage: ConvergenceStage;
  readonly slot: number;
}

export type PlanTuple<TPlugins extends readonly ConvergencePluginDescriptor[]> =
  TPlugins extends readonly [infer H, ...infer R]
    ? H extends ConvergencePluginDescriptor
      ? readonly [H, ...PlanTuple<Extract<R, readonly ConvergencePluginDescriptor[]>>]
      : readonly []
    : readonly [];

export interface PlanRuntime {
  readonly id: ConvergencePlanId;
  readonly studioId: ConvergenceStudioId;
  readonly runId: ConvergenceRunId;
  readonly lifecycle: ConvergenceLifecycle;
  readonly sequence: readonly PlanBlueprintStep[];
  readonly createdAt: string;
}

export interface BuildPlanInput {
  readonly plugins: readonly ConvergencePluginDescriptor[];
  readonly studioId: string;
  readonly runId: string;
  readonly lifecycle?: ConvergenceLifecycle;
}

export interface PlanDiagnostics {
  readonly created: number;
  readonly steps: number;
  readonly stageCounts: Readonly<Record<ConvergenceStage, number>>;
  readonly diagnostics: readonly string[];
}

const emptyStages = (): Readonly<Record<ConvergenceStage, number>> => ({
  discover: 0,
  evaluate: 0,
  simulate: 0,
  execute: 0,
  close: 0,
});

const uniqueStages = (input: readonly PlanBlueprintStep[]): readonly ConvergenceStage[] => {
  const set = new Set<ConvergenceStage>();
  for (const item of input) {
    set.add(item.stage);
  }
  return [...set].toSorted();
};

export const zipByStage = (
  left: readonly ConvergencePluginDescriptor[],
  right: readonly ConvergencePluginDescriptor[],
): ReadonlyArray<readonly [ConvergencePluginDescriptor, ConvergencePluginDescriptor]> => {
  const length = Math.min(left.length, right.length);
  return Array.from({ length }, (_, index) => [left[index], right[index]]);
};

export const buildPlanSequence = (plugins: readonly ConvergencePluginDescriptor[]): readonly PlanBlueprintStep[] => {
  const grouped = plugins
    .toSorted((left, right) => left.priority - right.priority)
    .map((plugin, index) => ({
      plugin,
      stage: plugin.stage,
      slot: index,
    }));

  return grouped;
};

export const buildPlan = (input: BuildPlanInput): PlanRuntime => ({
  id: normalizePlanId(`plan:${input.studioId}:${Date.now()}`),
  studioId: normalizeStudioId(input.studioId),
  runId: normalizeRunId(input.runId),
  lifecycle: input.lifecycle ?? 'queued',
  sequence: buildPlanSequence(input.plugins),
  createdAt: new Date().toISOString(),
});

const stageFold = (
  steps: readonly PlanBlueprintStep[],
  seed: Readonly<Record<ConvergenceStage, number>>,
): Readonly<Record<ConvergenceStage, number>> => {
  const acc = { ...seed } as Record<ConvergenceStage, number>;
  for (const step of steps) {
    acc[step.stage] = (acc[step.stage] ?? 0) + 1;
  }
  return acc;
};

export const describePlan = (plan: PlanRuntime): PlanDiagnostics => {
  const stageCounts = stageFold(plan.sequence, emptyStages());
  const diagnostics = [
    `plan=${plan.id}`,
    `lifecycle=${plan.lifecycle}`,
    `signature=${plan.id}`,
    ...uniqueStages(plan.sequence).map((stage) => `stage:${stage}`),
  ];

  return {
    created: Date.parse(plan.createdAt),
    steps: plan.sequence.length,
    stageCounts,
    diagnostics,
  };
};

export const mergePlans = <
  TLeft extends PlanTuple<readonly ConvergencePluginDescriptor[]>,
  TRight extends PlanTuple<readonly ConvergencePluginDescriptor[]>,
>(left: TLeft, right: TRight): readonly [...TLeft, ...TRight] => {
  return [...left, ...right] as const;
};

export const flattenPlanTuples = (
  tuples: readonly (readonly [string, ConvergencePluginDescriptor])[],
): readonly ConvergencePluginDescriptor[] => {
  return tuples.map((entry) => entry[1]);
};

export const planSlots = <T extends readonly PlanBlueprintStep[]>(plan: T): readonly string[] => {
  return mapWithIteratorHelpers(plan, (entry) => `${entry.plugin.id}:${entry.slot}`);
};

export const buildPlanDigest = (plan: PlanRuntime): string => {
  const pluginIds = plan.sequence.map((entry) => entry.plugin.id).join(',');
  return `${plan.id}::${pluginIds}::${plan.lifecycle}`;
};
