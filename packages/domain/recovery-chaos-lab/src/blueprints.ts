import type {
  ChaosEventMap,
  ChaosMetricWindow,
  ChaosNamespace,
  ChaosScenarioDefinition,
  ChaosStatus,
  ChaosTag,
  EventEnvelope,
  ScenarioId,
  StageBoundary
} from './types';
import { buildTopology } from './types';

export type ChaosAction<
  Name extends string = string,
  TPayload extends Record<string, unknown> = {}
> = {
  readonly name: Name;
  readonly payload: TPayload;
};

export type ActionPayload<TAction> = TAction extends ChaosAction<any, infer Payload> ? Payload : never;

export type ActionMap<T extends readonly ChaosAction<string, Record<string, unknown>>[]> = {
  [K in T[number] as K['name']]: K['payload'];
};

export type ChainInput<T extends readonly ChaosAction<string, Record<string, unknown>>[]> = T extends readonly [
  infer Head,
  ...infer Tail
]
    ? Head extends ChaosAction<string, infer Payload>
    ? readonly [Payload, ...ChainInput<Extract<Tail, readonly ChaosAction<string, Record<string, unknown>>[]>>]
    : readonly []
  : readonly [];

export type Pipeline<TAcc, TSteps extends readonly unknown[]> = TSteps extends readonly [
  infer Head,
  ...infer Tail
]
  ? Head extends StageBoundary<string, TAcc, infer Next>
    ? Pipeline<Next, Tail>
    : never
  : TAcc;

export interface ScenarioBlueprint<
  TNamespace extends ChaosNamespace,
  TScenarioId extends ScenarioId,
  TSteps extends readonly StageBoundary<string, unknown, unknown>[]
> {
  readonly namespace: TNamespace;
  readonly scenarioId: TScenarioId;
  readonly title: string;
  readonly description?: string;
  readonly stages: TSteps;
  readonly tags: readonly ChaosTag[];
}

export type ScenarioInputs<
  T extends ScenarioBlueprint<ChaosNamespace, ScenarioId, readonly StageBoundary<string, unknown, unknown>[]>
> = {
  [K in T['stages'][number]['name']]: Extract<T['stages'][number], { name: K }>['input'];
};

export type ScenarioOutputs<
  T extends ScenarioBlueprint<ChaosNamespace, ScenarioId, readonly StageBoundary<string, unknown, unknown>[]>
> = {
  [K in T['stages'][number]['name']]: Extract<T['stages'][number], { name: K }>['output'];
};

export type StageExecution<T extends StageBoundary<string, unknown, unknown>> = {
  readonly name: T['name'];
  readonly status: ChaosStatus;
  readonly at: number;
  readonly input: T['input'];
  readonly output?: T['output'];
  readonly error?: Error;
};

export interface BlueprintEnvelope<
  TSteps extends readonly StageBoundary<string, unknown, unknown>[]
> {
  readonly steps: TSteps;
  readonly namespace: ChaosNamespace;
  readonly runId: string;
  readonly runToken: string;
  readonly schedule: {
    readonly startedAt: number;
    readonly expectedWindow: ChaosMetricWindow;
  };
}

export type EnrichedStep<TStage extends StageBoundary<string, unknown, unknown>> = TStage & {
  readonly hash: string;
  readonly dependsOn: readonly TStage['name'][];
};

export type WithEventIndex<T> = T extends ChaosEventMap<infer M> ? M : never;

export interface TopologyPatch {
  readonly id: string;
  readonly from: string;
  readonly to: string;
  readonly weight: number;
}

export type TopologyMap = readonly TopologyPatch[];

export interface GraphMetrics {
  readonly nodes: number;
  readonly edges: number;
  readonly density: number;
}

export function buildScenarioMap<
  NS extends ChaosNamespace,
  SId extends ScenarioId,
  Steps extends readonly StageBoundary<string, unknown, unknown>[]
>(
  blueprint: ScenarioBlueprint<NS, SId, Steps>
): ScenarioBlueprint<NS, SId, Steps> {
  return blueprint;
}

export function deriveStepOrder<Steps extends readonly StageBoundary<string, unknown, unknown>[]>(
  blueprint: { readonly stages: Steps }
): readonly string[] {
  return blueprint.stages.map((stage) => stage.name);
}

export function validateDependencies<
  TSteps extends readonly StageBoundary<string, unknown, unknown>[],
  TBlueprint extends readonly ScenarioStep[]
>(
  stages: TSteps,
  steps: TBlueprint
): steps is TBlueprint {
  const names = new Set(stages.map((stage) => stage.name));
  return steps.every((step) => step.dependsOn?.every((dependency) => names.has(dependency)) ?? true);
}

export function toEventEnvelope<T extends { namespace: string; runId: string; id: string }>(
  input: T,
  payloads: ChaosEventMap<Record<string, unknown>>
): EventEnvelope<typeof payloads> {
  return {
    eventId: `run:${input.id}` as never,
    occurredAt: Date.now() as never,
    payloads
  };
}

type ScenarioStep = {
  readonly key: string;
  readonly dependsOn?: readonly string[];
};

export function createTopology<
  Inputs extends readonly StageBoundary<string, unknown, unknown>[]
>(
  stages: Inputs
): TopologyMap {
  const topology = buildTopology(stages);
  return topology.entries.map((edge, index) => ({
    id: `${edge.from}->${edge.to}:${index}`,
    from: edge.from,
    to: edge.to,
    weight: edge.weight
  }));
}

export function buildPipelineResult<
  T extends ChaosScenarioDefinition
>(
  definition: T,
  status: ChaosStatus
): {
  runId: string;
  namespace: T['namespace'];
  scenarioId: T['id'];
  status: ChaosStatus;
  progress: number;
  metrics: Record<`${string}::ratio`, number>;
} {
  return {
    runId: `${definition.id}:run:${Date.now()}`,
    namespace: definition.namespace,
    scenarioId: definition.id,
    status,
    progress: definition.stages.length === 0 ? 0 : 100,
    metrics: {
      'throughput::ratio': 1,
      'error::ratio': status === 'failed' ? 1 : 0
    }
  };
}
