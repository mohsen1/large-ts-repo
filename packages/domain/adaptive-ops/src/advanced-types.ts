import { Brand } from '@shared/core';
import { DeepReadonly, NonEmptyArray } from '@shared/type-level';
import { AdaptivePolicy, AdaptiveDecision, SignalSample } from './types';

export type TenantToken<TTenant extends string = string> = Brand<string, `tenant:${TTenant}`>;
export type PolicyToken<TPolicy extends string = string> = Brand<string, `policy:${TPolicy}`>;
export type DecisionFingerprint = Brand<string, 'DecisionFingerprint'>;
export type SignalRoute = `route:${string}`;
export type StageName = Brand<string, 'StageName'>;

export const baseStages = ['ingest', 'normalize', 'score', 'execute', 'drain'] as const;
export type BaseStage = (typeof baseStages)[number];

export interface PathSegment {
  readonly head: string;
  readonly next?: PathSegment;
}

type SegmentToken<T> = T extends string ? T : T & string;

export type RecursivePath<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Head extends string
      ? Tail extends readonly unknown[]
        ? Tail['length'] extends 0
          ? `${SegmentToken<Head>}`
          : `${SegmentToken<Head>}.${RecursivePath<Tail>}`
        : SegmentToken<Head>
      : never
    : never;

export type ReversePath<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly unknown[]
      ? Tail['length'] extends 0
        ? `${Head & string}`
        : `${Head & string}`
      : never
    : never;

export type ShiftPath<T extends readonly unknown[]> = T extends readonly [infer _First, ...infer Rest] ? Rest : readonly [];

export type FixedDepthTuple<Value, Count extends number, Acc extends Value[] = []> =
  Acc['length'] extends Count ? Acc : FixedDepthTuple<Value, Count, [...Acc, Value]>;

export type PathFromSignal<T extends AdaptiveDecision['selectedActions'][number]['targets']> = RecursivePath<Extract<T, readonly unknown[]>>;

export type NonEmptyTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Rest]
  ? readonly [Head, ...Rest]
  : never;

export type PolicyByIndex<I extends number, TPolicies extends readonly AdaptivePolicy[]> = TPolicies[I];

export type InferredTargetTypes<T> = T extends AdaptivePolicy ? T['dependencies'][number]['serviceId'] : never;

export type RenameKeys<T> = {
  [K in keyof T as K extends string ? `x_${K}` : never]: T[K];
};

export type PolicyPath<T extends readonly string[]> = T extends readonly [infer Head]
  ? Head extends string
    ? `${Head}`
    : never
  : T extends readonly [infer Head, ...infer Rest]
    ? Head extends string
      ? Rest extends readonly string[]
        ? `${Head}/${RecursivePath<Rest & readonly string[]>}`
        : never
      : never
    : never;

export type DecisionMap<T extends readonly AdaptiveDecision[]> = {
  [D in T[number] as D['risk']]: D[];
};

export type RiskByPolicy<T extends readonly AdaptiveDecision[]> = {
  [K in T[number]['policyId']]: Extract<T[number], { policyId: K }>[];
};

export interface DecisionTrace {
  policyId: string;
  policyRoute: SignalRoute | null;
  policyToken: PolicyToken;
  policyIndex: number;
  selectedActionCount: number;
  confidence: AdaptiveDecision['confidence'];
}

export interface PolicySignalGraph {
  tenantId: TenantToken;
  policyIds: readonly PolicyToken[];
  stagePath: StageName;
  traces: readonly DecisionTrace[];
  route: PolicyPath<['tenant', 'policy', 'decision']>;
}

export interface PolicyPathInput {
  tenantId: string;
  policyId: string;
  stage: BaseStage;
      actionTargets: readonly SignalSample[];
}

const toTenantToken = (value: string): TenantToken => `tenant:${value}` as TenantToken;
const toPolicyToken = (value: string): PolicyToken => `policy:${value}` as PolicyToken;
const toDecisionFingerprint = (value: string): DecisionFingerprint => `decision:${value}` as DecisionFingerprint;

export const createTenantToken = (value: string): TenantToken => toTenantToken(value);

export const createPolicyToken = (value: string): PolicyToken => toPolicyToken(value);

export const createDecisionFingerprint = (decision: AdaptiveDecision): DecisionFingerprint => {
  const components = [
    decision.policyId,
    decision.risk,
    String(decision.selectedActions.length),
    decision.confidence.toFixed(4),
  ] as const;
  return toDecisionFingerprint(components.join(':'));
};

export const asPolicyPath = <TParts extends readonly string[]>(parts: TParts): PolicyPath<TParts> => {
  return parts.join('/') as PolicyPath<TParts>;
};

export const toStageLabel = (index: number): StageName => {
  const stage = baseStages[index % baseStages.length] ?? 'ingest';
  return `stage:${stage}` as StageName;
};

export const indexByPolicy = (policies: readonly AdaptivePolicy[]) => {
  const entries = new Map<string, number>();
  policies.forEach((policy, index) => {
    entries.set(`${policy.id}`, index);
  });
  return entries;
};

export const collectTargetServices = (decisions: readonly AdaptiveDecision[]): readonly string[] => {
  const targets = new Set<string>();
  for (const decision of decisions) {
    for (const action of decision.selectedActions) {
      for (const target of action.targets) {
        targets.add(target);
      }
    }
  }
  return [...targets];
};

export const collectTargetHistogram = (decisions: readonly AdaptiveDecision[]): Record<string, number> => {
  const histogram: Record<string, number> = {};
  for (const decision of decisions) {
    for (const action of decision.selectedActions) {
      for (const target of action.targets) {
        histogram[target] = (histogram[target] ?? 0) + 1;
      }
    }
  }
  return histogram;
};

export const buildDecisionTrace = (input: PolicyPathInput, decisions: readonly AdaptiveDecision[]): PolicySignalGraph => {
  const policyIds = new Set<string>();
  const traces: DecisionTrace[] = [];

  for (const decision of decisions) {
    const signalRoute: PolicyPath<['tenant', 'policy', 'decision']> = asPolicyPath(['tenant', 'policy', 'decision']);
    const activeTargets = decision.selectedActions.flatMap((action) => action.targets);
    const path = createDecisionFingerprint(decision);
    traces.push({
      policyId: `${decision.policyId}`,
      policyRoute: signalRoute as SignalRoute,
      policyToken: createPolicyToken(`${decision.policyId}`),
      policyIndex: policyIds.size,
      selectedActionCount: decision.selectedActions.length + activeTargets.length,
      confidence: decision.confidence,
    });
    policyIds.add(`${decision.policyId}`);
  }

  return {
    tenantId: createTenantToken(input.tenantId),
    policyIds: [...policyIds].map((id) => createPolicyToken(id)),
    stagePath: toStageLabel(input.actionTargets.length),
    traces,
    route: asPolicyPath(['tenant', 'policy', 'decision']),
  };
};

export const rankPolicySignals = (
  decisions: readonly AdaptiveDecision[],
): readonly [policyId: string, count: number][] => {
  const buckets = new Map<string, number>();
  for (const decision of decisions) {
    const key = `${decision.policyId}`;
    buckets.set(key, (buckets.get(key) ?? 0) + decision.selectedActions.length);
  }
  return [...buckets.entries()]
    .sort((left, right) => right[1] - left[1])
    .map((entry) => entry);
};

export const enforceNonEmpty = <T extends readonly unknown[]>(values: T): NonEmptyTuple<T> => {
  if (values.length === 0) {
    throw new Error('empty list is not allowed');
  }
  return values as unknown as NonEmptyTuple<T>;
};

export const summarizeSignalsByPolicy = (
  policies: readonly AdaptivePolicy[],
  decisions: readonly AdaptiveDecision[],
) => {
  const policyIndex = indexByPolicy(policies);
  return decisions
    .map((decision) => ({
      policy: policyIndex.get(`${decision.policyId}`) ?? -1,
      policyId: `${decision.policyId}`,
      signals: decision.selectedActions.flatMap((action) => action.targets),
      confidence: decision.confidence,
    }))
    .filter((entry) => entry.policy >= 0);
};

export const deepReadonlyGraph = <T>(graph: T): DeepReadonly<T> => {
  return graph as DeepReadonly<T>;
};

export const selectDeepestSignals = (
  signals: readonly SignalSample[],
): readonly SignalSample[] => {
  const grouped = new Map<string, SignalSample[]>();
  for (const signal of signals) {
    const list = grouped.get(signal.kind) ?? [];
    list.push(signal);
    grouped.set(signal.kind, list);
  }

  return [...grouped.values()]
    .map((list) => list.sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime())[0])
    .filter((sample): sample is SignalSample => Boolean(sample));
};

export type SignalTuple<T extends readonly SignalSample[]> = FixedDepthTuple<SignalSample, 4> & T;

export const toFixedTuple = <T extends readonly SignalSample[]>(values: T): SignalTuple<T> => {
  return [
    values[0] ?? { kind: 'manual-flag', value: 0, unit: 'none', at: new Date().toISOString() },
    values[1] ?? { kind: 'manual-flag', value: 0, unit: 'none', at: new Date().toISOString() },
    values[2] ?? { kind: 'manual-flag', value: 0, unit: 'none', at: new Date().toISOString() },
    values[3] ?? { kind: 'manual-flag', value: 0, unit: 'none', at: new Date().toISOString() },
    ...values.slice(4),
  ] as SignalTuple<T>;
};
