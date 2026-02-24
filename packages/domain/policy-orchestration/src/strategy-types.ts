import {
  NoInfer,
  RecursivePath,
  Brand,
} from '@shared/type-level';
import {
  AnyPolicyPlugin,
  PolicyPlugin,
  PolicyPluginContext,
} from './plugin-framework';
import { OrchestrationNodeId, PolicyNode, PolicyGraph, PolicyPlan } from './models';

export type StrategyStage = 'discover' | 'design' | 'execute' | 'observe' | 'rollback';
export type StrategyNamespace = 'policy' | 'risk' | 'incident' | 'drill' | 'timeline';
export type StrategyRoute = `${StrategyNamespace}:${StrategyStage}:${string}`;
export type StrategyTraceId = Brand<string, 'StrategyTraceId'>;
export type StrategyNodePath = `node://${StrategyNamespace}/${string}`;
export type StrategyPluginKind = `${StrategyNamespace}-plugin`;
export type StrategySignal = `${StrategyNodePath}:${StrategyRoute}`;

export interface StrategyEnvelope<TInput, TOutput, TMeta = unknown> {
  readonly input: TInput;
  readonly output: TOutput;
  readonly meta: TMeta;
  readonly route: StrategyRoute;
  readonly traceId: StrategyTraceId;
  readonly createdAt: string;
}

export type PolicyPluginInput<T> = T extends PolicyPlugin<any, any, infer TInput, any, any, any> ? TInput : never;
export type PolicyPluginOutput<T> = T extends PolicyPlugin<any, any, any, infer TOutput, any, any> ? TOutput : never;
export type PluginInputTuple<TChain extends readonly AnyPolicyPlugin[]> = TChain extends readonly [
  infer Head extends AnyPolicyPlugin,
  ...infer Tail extends readonly AnyPolicyPlugin[],
]
  ? readonly [PolicyPluginInput<Head>, ...PluginInputTuple<Tail>]
  : [];

export type PluginOutputTuple<TChain extends readonly AnyPolicyPlugin[], TSeed> =
  TChain extends readonly [infer Head extends AnyPolicyPlugin, ...infer Tail extends readonly AnyPolicyPlugin[]]
    ? Tail extends readonly []
      ? readonly [PolicyPluginOutput<Head>]
      : readonly [PolicyPluginOutput<Head>, ...PluginOutputTuple<Tail, PolicyPluginOutput<Head>>]
    : readonly [TSeed];

export type TracePrefix<T extends string> = `${string}:${T}`;
export type StageAwareRoute<T extends StrategyStage> = TracePrefix<T>;

export type RecursiveTuple<T, N extends number, Acc extends T[] = []> =
  Acc['length'] extends N ? Acc : RecursiveTuple<T, N, [...Acc, T]>;

export interface StrategyPlanContext {
  readonly tenantId: string;
  readonly namespace: StrategyNamespace;
  readonly actor: string;
  readonly requestId: string;
  readonly requestedAt: string;
}

export interface StrategyNodeMeta {
  readonly path: StrategyNodePath;
  readonly namespace: StrategyNamespace;
  readonly stage: StrategyStage;
  readonly labels: Readonly<Record<string, string>>;
}

export interface StrategyNodeSnapshot {
  readonly nodeId: OrchestrationNodeId;
  readonly meta: StrategyNodeMeta;
  readonly artifactCount: number;
}

export interface StrategyPlanPlan<TPlugins extends readonly AnyPolicyPlugin[]> {
  readonly name: string;
  readonly version: `v${number}`;
  readonly plugins: TPlugins;
  readonly createdAt: string;
  readonly pluginSignature: TracePrefix<string>;
}

export type StrategyTopologyPath<T> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string as K]: T[K] extends Record<string, unknown>
        ? `${K}` | `${K}.${StrategyTopologyPath<T[K]>}`
        : K;
    }[keyof T & string]
  : never;

export type StrategyPlanProjection<T> = {
  [K in keyof T as K extends string ? `plan.${K}` : never]: T[K] extends object ? RecursivePath<T[K]> : T[K];
};

export interface StrategyNodeExecutionState {
  readonly traceId: StrategyTraceId;
  readonly context: StrategyPlanContext;
  readonly active: boolean;
  readonly startedAt: string;
  readonly route: StrategyRoute;
  readonly nodeIds: readonly OrchestrationNodeId[];
}

export interface StrategyWorkspaceRecord {
  readonly plan: PolicyPlan['id'];
  readonly namespace: StrategyNamespace;
  readonly stage: StrategyStage;
  readonly createdAt: string;
}

export interface StrategyWorkspaceSummary {
  readonly totalArtifacts: number;
  readonly totalEdges: number;
  readonly namespaces: readonly StrategyNamespace[];
}

const DEFAULT_STAGES = ['discover', 'design', 'execute', 'observe', 'rollback'] as const satisfies readonly StrategyStage[];

export const strategyStageLabel = (value: string): StrategyStage => {
  if (DEFAULT_STAGES.includes(value as StrategyStage)) {
    return value as StrategyStage;
  }
  return 'discover';
}

export const createStrategyTraceId = (seed: string): StrategyTraceId => `${seed}:${Date.now()}` as StrategyTraceId;

export const buildStrategyRoute = (namespace: StrategyNamespace, stage: StrategyStage, actor: string): StrategyRoute =>
  `${namespace}:${stage}:${actor}` as StrategyRoute;

export const parseStrategyRoute = (route: StrategyRoute): StrategyPlanContext => {
  const [namespace, stage, actor = 'system'] = route.split(':') as [StrategyNamespace, StrategyStage, string];
  return {
    tenantId: `${namespace}:${actor}`,
    namespace,
    actor,
    requestId: route,
    requestedAt: new Date().toISOString(),
  };
};

export const makeStrategyEnvelope = <TInput, TOutput>(
  input: TInput,
  output: TOutput,
  context: StrategyPlanContext,
  stage: StrategyStage,
): StrategyEnvelope<TInput, TOutput, StrategyPlanContext> => ({
  input,
  output,
  meta: context,
  route: buildStrategyRoute(context.namespace, stage, context.actor),
  traceId: createStrategyTraceId(context.requestId),
  createdAt: new Date().toISOString(),
});

export const collectStrategySignatures = <TChain extends readonly AnyPolicyPlugin[]>(
  plugins: TChain,
): readonly string[] =>
  plugins.map((plugin) => `${plugin.kind}:${plugin.name}`);

const deriveNamespace = (service: string): StrategyNamespace => {
  switch (service.trim().toLowerCase()) {
    case 'risk':
      return 'risk';
    case 'incident':
      return 'incident';
    case 'drill':
      return 'drill';
    case 'timeline':
      return 'timeline';
    default:
      return 'policy';
  }
};

export const collectStrategyTopology = (graph: PolicyGraph): readonly StrategyNodeSnapshot[] =>
  graph.nodes
    .map((node: PolicyNode, index: number) => ({
      nodeId: node.id,
      meta: {
        namespace: deriveNamespace(node.artifact.target.service),
        path: `node://${deriveNamespace(node.artifact.target.service)}/${node.id}` as StrategyNodePath,
        stage: DEFAULT_STAGES[index % DEFAULT_STAGES.length]!,
        labels: {
          artifact: node.artifact.name,
          owner: node.ownerTeam,
          region: node.artifact.target.region,
          team: node.ownerTeam,
        },
      },
      artifactCount: node.dependsOn.length + 1,
    }))
    .toSorted((left, right) => left.meta.labels.artifact.localeCompare(right.meta.labels.artifact));

export interface StrategyNodeScope {
  readonly namespace: StrategyNamespace;
  readonly path: StrategySignal;
  readonly allowedStages: readonly StrategyStage[];
}

export const validateStrategyScope = (scope: StrategyNodeScope, stage: StrategyStage): boolean => {
  return scope.namespace === 'policy' || scope.allowedStages.includes(stage);
};

export const normalizeStrategyContext = <TContext extends StrategyPlanContext>(context: NoInfer<TContext>): TContext => ({
  ...context,
  requestedAt: context.requestedAt ?? new Date().toISOString(),
  requestId: context.requestId || `${context.actor}:${Date.now()}`,
});
