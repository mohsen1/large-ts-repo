import { withBrand } from '@shared/core';
import type { Brand, NoInfer, PathTuple, RecursivePath, UnionToIntersection } from '@shared/type-level';
import type {
  DesignPlanId,
  DesignPlanTemplate,
  DesignSignalKind,
  DesignStage,
  DesignTenantId,
  DesignWorkspaceId,
  PlanSignal,
  WorkspaceTag,
} from './contracts';

export type { DesignWorkspaceId } from './contracts';

export type DesignPluginId = Brand<string, 'DesignPluginId'>;
export type DesignSessionId = Brand<string, 'DesignSessionId'>;
export type DesignWorkspaceKey = `ws:${DesignTenantId}:${DesignWorkspaceId}`;
export type WorkspaceFingerprint = `${DesignWorkspaceKey}/${DesignPlanId}`;
export type StageRoute<T extends string = DesignStage> = `route:${T}`;
export type StageAware<TStage extends DesignStage = DesignStage> = `stage:${TStage}`;
export type StageSignalRoute<
  TMetric extends DesignSignalKind = DesignSignalKind,
  TStage extends DesignStage = DesignStage,
> = `signal/${TMetric}/${TStage}`;
export type WorkspaceStageTag<T extends DesignStage = DesignStage> = `stage:${T}`;

export type RouteSet<T extends readonly DesignStage[]> = {
  [K in T[number] as `route:${K & string}`]: readonly DesignPlanTemplate[];
};

export type RouteChain<T extends readonly string[]> = T;

export type RecursiveTuple<T extends string, Limit extends number, Prefix extends readonly string[] = []> = Prefix['length'] extends Limit
  ? Prefix
  : [...Prefix, T] | RecursiveTuple<T, Limit, [...Prefix, T]>;

export type StageUnion<T extends readonly DesignStage[]> = T[number];

export type StageWeights<TStages extends readonly DesignStage[]> = {
  [K in TStages[number] as `route:${K & string}`]: {
    readonly weight: number;
    readonly order: number;
  };
};

export type SignalBundle<TSignals extends readonly PlanSignal[]> = {
  [K in TSignals[number] as `bundle:${K['metric']}`]: readonly K[];
};

export type SignalPath<T extends string> = T extends `${infer Head}/${infer Rest}`
  ? readonly [Head, ...SignalPath<Rest>]
  : readonly [T];

export type StageFingerprint<TTemplate extends DesignPlanTemplate> =
  `${TTemplate['tenantId']}:${TTemplate['workspaceId']}/${TTemplate['scenarioId']}`;

export type TemplateWithTags<T extends readonly DesignPlanTemplate[]> = {
  [K in T[number] as K['templateId']]: {
    readonly tenantId: K['tenantId'];
    readonly phases: K['phases'];
    readonly fingerprint: StageFingerprint<K>;
  };
};

export type PluginInputChain<TInput extends readonly unknown[]> = TInput extends readonly [infer Head, ...infer Tail]
  ? Tail extends readonly unknown[]
    ? readonly [Head, ...PluginInputChain<Tail>]
    : readonly [Head]
  : readonly [];

export type IntersectPath<T extends Record<string, unknown>> = PathTuple<RecursivePath<T>>;

export type UnionFromTuple<T extends readonly unknown[]> = T[number];

export type SignalSignatureSet<TSignals extends readonly PlanSignal[]> = Record<string, TSignals[number]['metric']>;

export type NormalizedTag<T extends string> = T extends `tag:${infer Rest}` ? `tag:${Rest}` : `tag:${T}`;
export type WeightedTag<TTag extends string> = `${TTag}|w=${number}`;

export interface AdvancedWorkspaceDescriptor {
  readonly tenant: DesignTenantId;
  readonly workspace: DesignWorkspaceId;
  readonly stage: DesignStage;
  readonly tags: readonly WorkspaceTag[];
}

export interface StageSignalBucket<T extends DesignSignalKind = DesignSignalKind> {
  readonly metric: T;
  readonly count: number;
  readonly latest: number;
}

export interface StageRunWindow {
  readonly route: StageSignalRoute;
  readonly from: number;
  readonly to: number;
  readonly count: number;
}

const defaultWeight = 5;

export const createDesignSessionId = (tenant: DesignTenantId, workspace: DesignWorkspaceId): DesignSessionId =>
  withBrand(`${tenant}::${workspace}::${Date.now()}`, 'DesignSessionId');

export const asSessionId = createDesignSessionId;

export const createWorkspaceKey = (tenant: DesignTenantId, workspace: DesignWorkspaceId): DesignWorkspaceKey =>
  `ws:${tenant}:${workspace}`;

export const buildWorkspaceFingerprint = (tenant: DesignTenantId, workspace: DesignWorkspaceId, planId: DesignPlanId): WorkspaceFingerprint =>
  `${createWorkspaceKey(tenant, workspace)}/${planId}`;

export const toSignalRoute = <TMetric extends DesignSignalKind>(
  metric: TMetric,
  stage: DesignStage,
): StageSignalRoute<TMetric, typeof stage> => `signal/${metric}/${stage}`;

export const createDesignPluginId = (value: string): DesignPluginId => withBrand(`plugin:${value}`, 'DesignPluginId');

export const normalizeTags = (tags: readonly string[]): readonly WorkspaceTag[] =>
  [...new Set(tags)].filter((value): value is string => value.length > 0).map((tag) => `tag:${tag}` as WorkspaceTag);

export const parseStageRoute = <TStage extends DesignStage>(route: StageRoute<TStage>): TStage => route.split(':')[1] as TStage;

export type StageRouteSet<TStages extends readonly DesignStage[]> = TStages extends readonly [infer Head, ...infer Tail]
  ? Head extends DesignStage
    ? { [K in `${Head}`]: readonly DesignPlanTemplate[] } & StageRouteSet<Tail & readonly DesignStage[]>
    : {}
  : {};

export const routeFromTemplate = <TTemplate extends DesignPlanTemplate>(
  template: TTemplate,
): StageRouteSet<TTemplate['phases']> => {
  const pairs = template.phases.map((stage) => [`route:${stage}` as const, [template] as const]);
  return Object.fromEntries(pairs) as unknown as StageRouteSet<TTemplate['phases']>;
};

export const toRouteSet = <TStages extends readonly DesignStage[]>(stages: NoInfer<TStages>): StageRouteSet<TStages> => {
  const pairs = stages.map((stage) => [`route:${stage}` as const, [] as const]);
  return Object.fromEntries(pairs) as unknown as StageRouteSet<TStages>;
};

export const inferStageSignalRoute = <TMetric extends DesignSignalKind>(
  metric: NoInfer<TMetric>,
  stage: DesignStage,
): StageSignalRoute<TMetric, typeof stage> => `signal/${metric}/${stage}`;

export const deriveWeights = <TPhases extends readonly DesignStage[]>(phases: NoInfer<TPhases>): StageWeights<TPhases> => {
  const pairs = stagesToWeightPairs(phases);
  return Object.fromEntries(pairs) as unknown as StageWeights<TPhases>;
};

const stagesToWeightPairs = <TPhases extends readonly DesignStage[]>(
  phases: NoInfer<TPhases>,
): readonly [keyof StageWeights<TPhases>, { readonly weight: number; readonly order: number }][] => {
  return phases.map((stage, index) => {
    const key = `route:${stage}` as keyof StageWeights<TPhases>;
    return [key, { weight: Math.max(0, defaultWeight - index), order: index }] as const;
  });
};

export const uniquePhases = <TTemplates extends readonly DesignPlanTemplate[]>(
  templates: NoInfer<TTemplates>,
): readonly StageUnion<TTemplates[number]['phases']>[] => {
  const all = new Set<string>();
  for (const template of templates) {
    for (const stage of template.phases) {
      all.add(stage);
    }
  }
  return [...all.values()] as StageUnion<TTemplates[number]['phases']>[];
};

export const splitSignalsByMetric = <TSignals extends readonly PlanSignal[]>(signals: NoInfer<TSignals>): SignalBundle<TSignals> => {
  const map = new Map<string, PlanSignal[]>();
  for (const signal of signals) {
    const key = `bundle:${signal.metric}`;
    map.set(key, [...(map.get(key) ?? []), signal]);
  }
  return Object.fromEntries(map) as unknown as SignalBundle<TSignals>;
};

export const mergeWorkspace = <
  TLeft extends Record<string, unknown>,
  TRight extends Record<string, unknown>,
>(left: NoInfer<TLeft>, right: NoInfer<TRight>): UnionToIntersection<TLeft & TRight> => {
  return ({ ...left, ...right }) as UnionToIntersection<TLeft & TRight>;
};

export const collectRouteSignatures = <T extends readonly DesignPlanTemplate[]>(
  templates: NoInfer<T>,
): IntersectPath<RouteSet<T[0]['phases']>>[] => {
  const entries = templates.map((template) =>
    Object.fromEntries(template.phases.map((stage) => [buildRouteSignature(template, stage), inferStageSignalRoute('health', stage)])),
  );
  return entries as unknown as IntersectPath<RouteSet<T[0]['phases']>>[];
};

const buildRouteSignature = (template: { readonly templateId: string }, stage: string): string => `${template.templateId}:${stage}`;

export const foldPlanTemplates = <TTemplates extends readonly DesignPlanTemplate[]>(
  templates: NoInfer<TTemplates>,
  separator: string,
): readonly string[] => templates.map((template) => `${template.templateId}${separator}${template.nodes.length}`);

export const normalizeWorkspaceDescriptor = (descriptor: AdvancedWorkspaceDescriptor): AdvancedWorkspaceDescriptor => ({
  tenant: descriptor.tenant,
  workspace: descriptor.workspace,
  stage: descriptor.stage,
  tags: normalizeTags(descriptor.tags.map((entry) => entry.replace(/^tag:/, ''))),
});

export const inferPhaseSignature = (metric: DesignSignalKind): Partial<Record<DesignSignalKind, DesignSignalKind>> =>
  ({ [metric]: metric } as Partial<Record<DesignSignalKind, DesignSignalKind>>);

export const buildSignalPath = <T extends readonly PlanSignal[]>(signals: NoInfer<T>): SignalPath<string> => {
  const path = signals.map((signal) => `${signal.metric}/${signal.stage}`).join('/');
  if (!path) {
    return [] as unknown as SignalPath<string>;
  }
  return path.split('/') as unknown as SignalPath<string>;
};

export const splitSignals = <
  TLeft extends readonly PlanSignal[],
  TRight extends readonly PlanSignal[],
>(left: NoInfer<TLeft>, right: NoInfer<TRight>): PluginInputChain<[TLeft, TRight]> => {
  const pairs = left
    .toSorted((l, r) => l.value - r.value)
    .map((entry, index) => [entry, right[index] ?? entry] as const)
    .toSorted((l, r) => (l[0].metric < r[0].metric ? -1 : 1));
  return pairs as unknown as PluginInputChain<[TLeft, TRight]>;
};

export const aggregateWorkspace = (descriptors: readonly AdvancedWorkspaceDescriptor[]): readonly Record<string, number>[] => {
  const grouped = new Map<string, number>();
  for (const descriptor of descriptors) {
    const key = `${descriptor.tenant}:${descriptor.workspace}`;
    grouped.set(key, (grouped.get(key) ?? 0) + 1);
  }
  return [...grouped.entries()].map(([key, count]) => ({ [key]: count }));
};

export const buildStageTag = (stage: NoInfer<DesignStage>): WorkspaceStageTag<DesignStage> => `stage:${stage}`;

export const asDesignPlanId = (tenant: DesignTenantId, workspace: DesignWorkspaceId, scenario: string): DesignPlanId =>
  withBrand(`${tenant}:${workspace}:${scenario}`, 'DesignPlanId');
