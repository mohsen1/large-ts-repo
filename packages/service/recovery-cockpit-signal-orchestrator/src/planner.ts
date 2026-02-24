import type {
  MeshExecutionPhase,
  MeshIntent,
  MeshPlan,
  MeshPlanId,
  MeshRunId,
} from '@domain/recovery-cockpit-signal-mesh';
import type { NoInfer } from '@shared/type-level';

export interface MeshPlanContext {
  readonly tenant: string;
  readonly region: string;
  readonly phase: MeshExecutionPhase;
  readonly runId: MeshRunId;
}

export interface MeshRunSummary {
  readonly tenant: string;
  readonly runId: MeshRunId;
  readonly phase: MeshExecutionPhase;
  readonly events: number;
  readonly planCoverage: number;
}

export type PlanByPhase = {
  readonly [K in MeshExecutionPhase]: readonly MeshIntent[];
};

export const planByPhase = (plan: MeshPlan, phase?: MeshExecutionPhase): PlanByPhase => {
  const buckets: Record<MeshExecutionPhase, MeshIntent[]> = {
    detect: [],
    assess: [],
    orchestrate: [],
    simulate: [],
    execute: [],
    observe: [],
    recover: [],
    settle: [],
  };
  for (const intent of plan.intents) {
    buckets[intent.phase].push(intent);
  }
  if (phase === undefined) {
    return buckets;
  }
  return buckets;
};

export const computePlanCoverage = (plan: PlanByPhase): number => {
  const total = Object.values(plan).reduce((acc, bucket) => acc + bucket.length, 0);
  const covered = Object.values(plan).reduce((acc, bucket) => acc + bucket.filter((intent) => intent.expectedConfidence >= 0.5).length, 0);
  if (total === 0) {
    return 0;
  }
  return covered / total;
};

export const assignPhaseWindow = <T extends { readonly phase: MeshExecutionPhase }>(
  items: readonly T[],
  phase: MeshExecutionPhase,
): readonly T[] => items.map((item) => ({ ...item, phase }));

export const flattenPlanBuckets = (byPhase: PlanByPhase): readonly MeshIntent[] =>
  Object.values(byPhase).flatMap((bucket) => bucket);

export const asTuple = <const T extends readonly unknown[]>(value: T): readonly [...T] => [...value];

export const planSummary = (plan: MeshPlan): string => `${plan.id as string}=${plan.intents.length} intents`;

export const mergeIntents = (
  left: readonly MeshIntent[],
  right: readonly MeshIntent[],
): readonly MeshIntent[] => {
  const map = new Map<string, MeshIntent>();
  for (const intent of [...left, ...right]) {
    map.set(intent.id as string, intent);
  }
  return [...map.values()];
};

export const planSignature = <TPlan extends MeshPlan>(plan: TPlan): `${MeshRunId & string}:${MeshPlanId & string}` => {
  return `${plan.runId as string}:${plan.id as string}` as `${MeshRunId & string}:${MeshPlanId & string}`;
};

export const buildPlanContext = (plan: MeshPlan, phase: MeshExecutionPhase): MeshPlanContext => ({
  tenant: plan.tenant as string,
  region: plan.intents.at(0)?.targetNodeIds[0] as string,
  phase,
  runId: plan.runId,
});

export const normalizeConfidence = (value: NoInfer<number>): number => (value < 0 ? 0 : value > 1 ? 1 : value);

export const rankIntents = (intents: readonly MeshIntent[]): readonly MeshIntent[] =>
  [...intents].sort((left, right) => right.expectedConfidence - left.expectedConfidence);
