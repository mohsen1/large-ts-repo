import type { Brand, DeepReadonly } from '@shared/type-level';
import {
  buildPluginId,
  canonicalizeNamespace,
  type PluginNamespace,
  type PluginKind,
} from './ids';
import type { PluginDefinition } from './plugin-registry';

export type NoInfer<T> = [T][T extends never ? never : 0];
export type ReadonlyNonEmptyArray<T> = readonly [T, ...T[]];
export type BrandId<T extends string, B extends string> = Brand<T, B>;

export type RuntimeEnvironment = 'dev' | 'preprod' | 'prod';
export type RuntimeMode = 'interactive' | 'batch' | 'streaming' | 'simulation';
export type RuntimeChannel = 'console' | 'api' | 'scheduler' | 'mesh';

export type WorkspaceNamespace = `${RuntimeEnvironment}:${RuntimeMode}:${RuntimeChannel}`;
export type TenantAwareNamespace<TNamespace extends string> = `${TNamespace}/${string}`;
export type SegmentTuple<TPath extends string> = TPath extends `${infer H}/${infer R}`
  ? readonly [H, ...SegmentTuple<R>]
  : readonly [TPath];

export type RecursiveTuple<T, N extends number, TAccum extends readonly T[] = readonly []> = TAccum['length'] extends N
  ? TAccum
  : RecursiveTuple<T, N, readonly [...TAccum, T]>;

export type ConcatTuple<T extends readonly unknown[], U extends readonly unknown[]> = readonly [...T, ...U];
export type TailTuple<T extends readonly unknown[]> = T extends readonly [unknown, ...infer Rest] ? Rest : [];
export type HeadTuple<T extends readonly unknown[]> = T extends readonly [infer H, ...unknown[]] ? H : never;
export type LastTuple<T extends readonly unknown[]> = T extends readonly [...unknown[], infer L] ? L : never;

export interface RuntimeMetadata {
  readonly namespace: WorkspaceNamespace;
  readonly environment: RuntimeEnvironment;
  readonly owner: string;
  readonly labels: ReadonlyMap<string, string>;
  readonly buildId: string;
}

export interface StepTrace<TPayload = unknown> {
  readonly stepId: BrandId<string, 'StepId'>;
  readonly phase: string;
  readonly startedAt: number;
  readonly durationMs: number;
  readonly payload: DeepReadonly<TPayload>;
  readonly tags: readonly string[];
}

export interface OrchestrationPlanSnapshot {
  readonly planId: BrandId<string, 'PlanId'>;
  readonly createdAt: number;
  readonly version: number;
  readonly namespace: WorkspaceNamespace;
  readonly steps: readonly BrandId<string, 'StepId'>[];
  readonly plugins: readonly string[];
}

export interface WorkspaceInput<TContext extends object = Record<string, unknown>> {
  readonly tenantId: string;
  readonly namespace: WorkspaceNamespace;
  readonly channel: RuntimeChannel;
  readonly mode: RuntimeMode;
  readonly labels: readonly string[];
  readonly context: TContext;
}

export type WorkspaceConfig<TExtra extends object = Record<string, never>> = {
  readonly timeoutMs: number;
  readonly maxConcurrency: number;
  readonly retryWindowMs: number;
  readonly featureFlags: DeepReadonly<Record<string, boolean>>;
} & TExtra;

export type WorkspaceEnvelope<
  TContext extends object = Record<string, unknown>,
  TConfig extends object = Record<string, never>,
> = {
  readonly tenantId: string;
  readonly namespace: WorkspaceNamespace;
  readonly runId: BrandId<string, 'RunId'>;
  readonly planId: BrandId<string, 'PlanId'>;
  readonly config: WorkspaceConfig<TConfig>;
  readonly input: WorkspaceInput<TContext>;
  readonly metadata: RuntimeMetadata;
};

export type PluginByKind<
  TKind extends PluginDefinition<any, any, any, PluginKind>,
> = TKind extends PluginDefinition<any, any, any, infer Kind> ? Kind : never;

export type MapByKind<
  TCatalog extends Record<string, PluginDefinition<any, any, any, PluginKind>>,
  TKind extends PluginKind,
> = {
  [K in keyof TCatalog as PluginByKind<TCatalog[K]> extends TKind ? K : never]:
    Extract<TCatalog[K], PluginDefinition<any, any, any, TKind>>;
};

export type PluginIdByNamespace<
  TNamespace extends WorkspaceNamespace,
  TKind extends PluginKind,
> = `${TNamespace}:${TKind}:${string}`;

const defaultMetadata = createRuntimeMetadata();

function createRuntimeMetadata(): RuntimeMetadata {
  const initialLabels = new Map<string, string>([
    ['domain', 'lab'],
    ['surface', 'stress'],
  ]);

  return {
    namespace: 'prod:interactive:console',
    environment: 'prod',
    owner: 'recovery-lab-dashboard',
    labels: initialLabels,
    buildId: 'build-0',
  };
}

export const buildRuntimeId = (tenant: string, seed: string, namespace: string): BrandId<string, 'RunId'> =>
  `${tenant}/${namespace}/${seed}` as BrandId<string, 'RunId'>;

export const buildPlanId = (
  tenant: string,
  namespace: WorkspaceNamespace,
  phase: string,
): BrandId<string, 'PlanId'> =>
  `${tenant}:${namespace}:plan:${phase}` as BrandId<string, 'PlanId'>;

export const buildStepId = (planId: BrandId<string, 'PlanId'>, phase: string, index: number): BrandId<string, 'StepId'> =>
  `${planId}:${phase}:${String(index).padStart(3, '0')}` as BrandId<string, 'StepId'>;

export const canonicalRuntimeNamespace = (input: string): WorkspaceNamespace =>
  canonicalizeNamespace(input) as WorkspaceNamespace;

export const encodeWorkspaceRoute = <TNamespace extends WorkspaceNamespace>(input: {
  readonly tenantId: string;
  readonly namespace: TNamespace;
  readonly segment: SegmentTuple<string>;
  readonly runId: BrandId<string, 'RunId'>;
}): string =>
  `${input.tenantId}/${input.namespace}/${input.segment.join('/')}/${input.runId}`;

export const decodeWorkspaceRoute = (route: string): {
  readonly tenantId: string;
  readonly namespace: WorkspaceNamespace;
  readonly parts: SegmentTuple<string>;
  readonly runId: BrandId<string, 'RunId'>;
} => {
  const parts = route.split('/');
  const tenantId = parts[0] ?? '';
  const namespace = `${parts[1] ?? ''}:${parts[2] ?? ''}:${parts[3] ?? ''}` as WorkspaceNamespace;
  const runId = `${parts.at(-1)}` as BrandId<string, 'RunId'>;
  return {
    tenantId,
    namespace,
    parts: (parts.slice(4, -1) as unknown) as SegmentTuple<string>,
    runId,
  };
};

export const toWorkspaceDigest = (snapshot: OrchestrationPlanSnapshot): string =>
  `${snapshot.namespace}#${snapshot.planId}#${snapshot.version}#${snapshot.steps.length}#${snapshot.plugins.length}`;

export const normalizeRuntimeNamespace = (value: string): WorkspaceNamespace => {
  if (value === '') {
    return defaultMetadata.namespace;
  }
  return canonicalizeNamespace(value) as WorkspaceNamespace;
};

export const inferNamespace = <TInput extends string>(input: TInput): TenantAwareNamespace<TInput> =>
  `${input}/${Math.random().toString(36).slice(2)}` as TenantAwareNamespace<TInput>;

export const extractNamespaceSegments = (namespace: WorkspaceNamespace): readonly string[] => namespace.split(':');

export const buildWorkspaceEnvelope = <TContext extends object, TConfig extends object>(
  tenantId: string,
  namespace: WorkspaceNamespace,
  planId: BrandId<string, 'PlanId'>,
  context: TContext,
  config: WorkspaceConfig<TConfig>,
): WorkspaceEnvelope<TContext, TConfig> => {
  const runId = buildRuntimeId(tenantId, `run-${planId.slice(-6)}`, namespace);

  return {
    tenantId,
    namespace,
    runId,
    planId,
    config,
    input: {
      tenantId,
      namespace,
      channel: 'console',
      mode: 'interactive',
      labels: [`tenant:${tenantId}`, `phase:${planId}`],
      context,
    },
    metadata: {
      ...defaultMetadata,
      namespace,
      environment: namespace.includes('prod')
        ? 'prod'
        : namespace.includes('preprod')
          ? 'preprod'
          : 'dev',
    },
  };
};

export const buildTraceFromInput = <TContext extends object>(input: WorkspaceInput<TContext>): StepTrace<TContext> => ({
  stepId: buildStepId(`plan:${input.tenantId}` as BrandId<string, 'PlanId'>, 'input', 0),
  phase: 'input',
  startedAt: Date.now(),
  durationMs: 0,
  payload: input as DeepReadonly<TContext>,
  tags: input.labels,
});

export const isWorkspaceNamespace = (value: string): value is WorkspaceNamespace => value.split(':').length === 3;

export const withRunContext = <T, TNamespace extends WorkspaceNamespace>(
  namespace: TNamespace,
  fn: (id: BrandId<string, 'RunId'>, route: string) => T,
): T => {
  const runId = buildRuntimeId('tenant', namespace, 'ctx') as BrandId<string, 'RunId'>;
  const path = encodeWorkspaceRoute({
    tenantId: 'tenant',
    namespace,
    segment: ['bootstrap', 'step'] as unknown as SegmentTuple<string>,
    runId,
  });
  return fn(runId, path);
};

export const splitNamespace = <T extends string>(value: T): readonly [prefix: string, ...rest: SegmentTuple<T>] => {
  const [prefix, ...rest] = value.split(':');
  return [prefix, ...rest] as unknown as readonly [prefix: string, ...SegmentTuple<T>];
};

export const cloneWorkspaceMetadata = (metadata: DeepReadonly<RuntimeMetadata>): RuntimeMetadata => ({
  namespace: metadata.namespace,
  environment: metadata.environment,
  owner: metadata.owner,
  labels: new Map(metadata.labels),
  buildId: metadata.buildId,
});

export const assertWorkspaceContext = (value: unknown): value is WorkspaceEnvelope => {
  if (value === null || value === undefined || typeof value !== 'object') {
    return false;
  }
  const envelope = value as WorkspaceEnvelope;
  return (
    'tenantId' in envelope &&
    'namespace' in envelope &&
    'runId' in envelope &&
    'planId' in envelope &&
    'config' in envelope &&
    isWorkspaceNamespace(`${envelope.namespace}`)
  );
};

export const identityWorkspaceId = (namespace: PluginNamespace, kind: PluginKind, seed: string): string =>
  String(buildPluginId(namespace, kind, seed));
