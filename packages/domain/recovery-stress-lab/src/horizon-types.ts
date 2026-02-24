export type Brand<T, TBrand extends string> = T & {
  readonly __brand: TBrand;
};

export type NoInfer<T> = [T][T extends any ? 0 : never];

export type HorizonStage =
  | 'sense'
  | 'assess'
  | 'plan'
  | 'simulate'
  | 'approve'
  | 'execute'
  | 'verify'
  | 'close';

export type HorizonDomain = 'incident' | 'drill' | 'policy' | 'fabric' | 'analytics';

export type HorizonScopeLabel = `${HorizonDomain}:default`;

export type HorizonScenarioId = Brand<string, 'HorizonScenarioId'>;
export type HorizonWorkspaceId = Brand<string, 'HorizonWorkspaceId'>;
export type HorizonSessionId = Brand<string, 'HorizonSessionId'>;
export type HorizonArtifactId = Brand<string, 'HorizonArtifactId'>;

export type HorizonNamespace = `${HorizonDomain}:${string}`;

export type HorizonEventLabel<TScope extends HorizonScopeLabel, TStage extends HorizonStage> = `horizon:${TScope}:${TStage}`;

export interface BrandRegistry {
  readonly scenario: HorizonScenarioId;
  readonly workspace: HorizonWorkspaceId;
  readonly session: HorizonSessionId;
}

export interface HorizonIdentity {
  readonly ids: BrandRegistry;
  readonly trace: Brand<string, 'HorizonTrace'>;
  readonly createdAt: number;
}

export type SplitPath<TPath extends string> = TPath extends `${infer Head}/${infer Tail}`
  ? [Head, ...SplitPath<Tail>]
  : [TPath];

export type JoinPath<TParts extends readonly string[]> = TParts extends readonly [
  infer Head extends string,
  ...infer Rest extends readonly string[],
]
  ? Rest extends readonly []
    ? Head
    : `${Head}/${JoinPath<Rest>}`
  : '';

export type RecursivePrefixes<TParts extends readonly string[]> = TParts extends readonly [
  infer Head extends string,
  ...infer Rest extends readonly string[],
]
  ? Rest['length'] extends 0
    ? readonly [Head]
    : readonly [Head, `${Head}/${RecursivePrefixes<Rest>[number]}`]
  : readonly [];

export type ExpandablePrefixes<TPath extends string> =
  | SplitPath<TPath>
  | RecursivePrefixes<SplitPath<TPath>>[number]
  | TPath;

export type MetricShape<T extends Record<string, unknown>> = {
  [K in keyof T as `metric:${Extract<K, string>}`]: T[K];
};

export type UndoMetricShape<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T as K extends `metric:${infer Base}` ? Base : never]: T[K];
    }
  : never;

export type StageRanking<T extends readonly HorizonStage[]> = {
  [K in T[number]]: number;
};

export type StageConfig = {
  readonly order: HorizonStage[];
  readonly weights: StageRanking<[
    'sense',
    'assess',
    'plan',
    'simulate',
    'approve',
    'execute',
    'verify',
    'close'
  ]>;
};

export const defaultStages = [
  'sense',
  'assess',
  'plan',
  'simulate',
  'approve',
  'execute',
  'verify',
  'close',
] as const satisfies readonly HorizonStage[];

export type StageChain<T extends readonly HorizonStage[] = typeof defaultStages> =
  T extends readonly [infer Head extends HorizonStage, ...infer Rest extends readonly HorizonStage[]]
    ? `${Head}` | `${Head}/${StageChain<Rest>}`
    : never;

export interface HorizonScenarioEnvelope {
  readonly scenarioId: HorizonScenarioId;
  readonly workspaceId: HorizonWorkspaceId;
  readonly route: StageChain<typeof defaultStages>;
  readonly payload: MetricShape<Record<string, string | number | boolean>>;
}

export interface HorizonMetric {
  readonly name: string;
  readonly severity: 1 | 2 | 3 | 4 | 5;
  readonly score: number;
  readonly unit: Brand<string, 'HorizonMetricUnit'>;
}

export interface HorizonMetricRow {
  readonly metric: HorizonMetric;
  readonly labels: UndoMetricShape<Record<string, string>>;
}

export interface HorizonSnapshot {
  readonly artifactId: HorizonArtifactId;
  readonly scenarioId: HorizonScenarioId;
  readonly timestamp: string;
  readonly metrics: readonly HorizonMetric[];
  readonly stage: HorizonStage;
}

export interface HorizonTemplate {
  readonly templateId: Brand<string, 'HorizonTemplateId'>;
  readonly domain: HorizonDomain;
  readonly stageOrder: typeof defaultStages;
  readonly maxIterations: number;
  readonly metricSchema: MetricShape<Record<string, number>>;
}

export const baseTemplate = {
  templateId: 'incident-template-v1' as Brand<string, 'HorizonTemplateId'>,
  domain: 'incident',
  stageOrder: ['sense', 'assess', 'plan', 'simulate', 'approve', 'execute', 'verify', 'close'],
  maxIterations: 8,
  metricSchema: {
    'metric:reliability:uptime': 0,
    'metric:coverage:assertions': 0,
    'metric:risk:index': 0,
  },
} as const satisfies HorizonTemplate;

const toPath = <T extends readonly string[]>(...parts: T): JoinPath<T> => parts.join('/') as JoinPath<T>;

export const buildHorizonLabel = <TScope extends HorizonDomain, TStage extends HorizonStage>(
  scope: TScope,
  stage: TStage,
): HorizonEventLabel<`${TScope}:default`, TStage> =>
  `horizon:${scope}:default:${stage}` as HorizonEventLabel<`${TScope}:default`, TStage>;

export const buildHorizonPath = <TPath extends string>(...parts: SplitPath<TPath>): ExpandablePrefixes<TPath> =>
  toPath(...parts) as ExpandablePrefixes<TPath>;

export const parseHorizonLabel = <TStage extends HorizonStage>(
  input: HorizonEventLabel<HorizonScopeLabel, TStage>,
): {
  readonly scope: HorizonScopeLabel;
  readonly stage: TStage;
} => {
  const [_prefix, scope, stage] = input.split(':') as [string, HorizonScopeLabel, TStage];
  return { scope, stage };
};

export type StageFromLabel<TLabel extends HorizonEventLabel<HorizonScopeLabel, HorizonStage>> =
  TLabel extends `horizon:${string}:${infer Stage}`
    ? Stage extends HorizonStage
      ? Stage
      : never
    : never;

export const stageWeight = (label: HorizonEventLabel<HorizonScopeLabel, HorizonStage>): number => {
  const stage = parseHorizonLabel(label).stage;
  return baseTemplate.stageOrder.findIndex((candidate) => candidate === stage) + 1;
};

export const serializeScope = (identity: HorizonIdentity): string =>
  `${identity.ids.scenario}|${identity.ids.workspace}|${identity.ids.session}|${identity.trace}|${identity.createdAt}`;

export const deserializeScope = (value: string): HorizonIdentity => {
  const [scenario, workspace, session, trace, createdAt] = value.split('|');
  return {
    ids: {
      scenario: scenario as HorizonScenarioId,
      workspace: workspace as HorizonWorkspaceId,
      session: session as HorizonSessionId,
    },
    trace: trace as Brand<string, 'HorizonTrace'>,
    createdAt: Number(createdAt),
  };
};

export const inferMetricKeys = <TMetric>(
  metric: TMetric,
): (keyof UndoMetricShape<TMetric extends Record<string, unknown> ? MetricShape<TMetric> : never>)[] =>
  Object.keys(metric as Record<string, unknown>) as Array<
    keyof UndoMetricShape<TMetric extends Record<string, unknown> ? MetricShape<TMetric> : never>
  >;

export const collectStageChain = <T extends readonly HorizonStage[]>(
  chain: T,
): StageChain<T> => chain.map((entry) => entry).join('/') as StageChain<T>;

export const makeBranded = <T extends string>(value: T, _marker?: Brand<T, T>): Brand<T, 'HorizonId'> =>
  value as Brand<T, 'HorizonId'>;
