import type {
  ChaosEventMap,
  ChaosMetricWindow,
  ChaosNamespace,
  ChaosRunSnapshot,
  ChaosScenarioDefinition,
  ChaosStatus,
  ChaosTag,
  EpochMs,
  EventEnvelope,
  RunId,
  ScenarioId,
  StageBoundary
} from '@domain/recovery-chaos-lab';
import { buildTopology, type EntityId } from '@domain/recovery-chaos-lab';
import type { Result } from '@shared/result';

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

export type ActionKind = 'latency' | 'packet-loss' | 'throttle' | 'node-drain' | 'chaos-stop';

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
  readonly at: EpochMs;
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
    readonly startedAt: EpochMs;
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

export interface TopologyState {
  readonly id: string;
  readonly edges: TopologyMap;
}

export interface TopologyContext {
  readonly matrix: ReturnType<typeof buildTopology<readonly StageBoundary<string, unknown, unknown>[]>>;
}

export interface TopologyRequest {
  readonly topology: TopologyState;
  readonly context: TopologyContext;
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

type ScenarioStep = {
  readonly key: string;
  readonly dependsOn?: readonly string[];
};

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
    eventId: `run:${input.id}` as EntityId,
    occurredAt: Date.now() as EpochMs,
    payloads
  };
}

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

export type ChaosRunEventKind =
  | 'run-started'
  | 'stage-started'
  | 'stage-complete'
  | 'stage-failed'
  | 'run-complete'
  | 'run-failed';

export interface BaseChaosRunEvent {
  readonly runId: RunId;
  readonly at: EpochMs;
  readonly kind: ChaosRunEventKind;
}

export interface ChaosRunStartedEvent extends BaseChaosRunEvent {
  readonly kind: 'run-started';
}

export interface ChaosStageEvent<TStageName extends string = string> extends BaseChaosRunEvent {
  readonly kind: 'stage-started' | 'stage-complete' | 'stage-failed';
  readonly stage: TStageName;
  readonly payload: Record<string, unknown>;
}

export interface ChaosRunFinalEvent extends BaseChaosRunEvent {
  readonly kind: 'run-complete' | 'run-failed';
  readonly status: ChaosStatus;
  readonly snapshot: ChaosRunSnapshot;
}

export type ChaosRunEvent<TStageName extends string = string> =
  | ChaosRunStartedEvent
  | ChaosStageEvent<TStageName>
  | ChaosRunFinalEvent;

export interface ChaosSchedulerOptions {
  readonly dryRun?: boolean;
  readonly signal?: AbortSignal;
  readonly tags?: readonly string[];
  readonly preferredActions?: readonly ActionKind[];
}

export interface ChaosRunState {
  readonly runId: RunId;
  readonly namespace: ChaosNamespace;
  readonly scenarioId: ScenarioId;
  status: ChaosStatus;
  progress: number;
  startedAt: EpochMs;
  updatedAt: EpochMs;
  readonly trace: readonly StageTrace[];
}

export interface StageTrace {
  readonly stage: string;
  readonly startedAt: EpochMs;
  readonly endedAt?: EpochMs;
  readonly status: ChaosStatus;
  readonly error?: string;
}

export interface StepResult<TStage extends StageBoundary<string, unknown, unknown>> {
  readonly stage: TStage['name'];
  readonly output: TStage['output'];
  readonly at: EpochMs;
}

export type StageResultMap<T extends readonly StageBoundary<string, unknown, unknown>[]> =
  Partial<{
    [K in T[number] as K['name']]: {
      readonly output: Extract<T[number], { name: K['name'] }>['output'];
      readonly at: EpochMs;
    };
  }> &
  Record<string, { readonly output: unknown; readonly at: EpochMs } | undefined>;

export interface ChaosRunReport<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly runId: RunId;
  readonly namespace: ChaosNamespace;
  readonly scenarioId: ScenarioId;
  readonly status: ChaosStatus;
  readonly progress: number;
  readonly snapshot: ChaosRunSnapshot;
  readonly trace: readonly StageTrace[];
  readonly steps: StageResultMap<T>;
  readonly finalAt: EpochMs;
}

export interface PluginAdapter<TStage extends StageBoundary<string, unknown, unknown>> {
  readonly plugin: TStage['name'];
  readonly execute: (
    input: TStage['input'],
    context: RunContext
  ) => Promise<Result<TStage['output']>>;
}

export interface RegistryLike<
  TStages extends readonly StageBoundary<string, unknown, unknown>[]
> {
  readonly get: <Name extends TStages[number]['name']>(
    name: Name
  ) => PluginAdapter<Extract<TStages[number], { name: Name }>> | undefined;
}

export interface ExecutionSummary {
  readonly attempts: number;
  readonly failures: number;
  readonly elapsedMs: number;
}

export interface RunContext {
  readonly namespace: ChaosNamespace;
  readonly scenarioId: ScenarioId;
  readonly runId: RunId;
  readonly signal?: AbortSignal;
  readonly preferredActions?: readonly ActionKind[];
}

export type RecStages<T extends readonly StageBoundary<string, unknown, unknown>[]> =
  T extends readonly [infer Head, ...infer Tail]
    ? Tail extends readonly StageBoundary<string, unknown, unknown>[]
      ? readonly [Head, ...RecStages<Tail>]
      : readonly [Head]
    : readonly [];
