import type { Brand, DeepMerge, JsonObject, JsonValue, Prettify } from '@shared/type-level';

export type OrchestrationTenant = Brand<string, 'OrchestrationTenant'>;
export type OrchestrationRunId = Brand<string, 'OrchestrationRunId'>;
export type OrchestrationStageId = Brand<string, 'OrchestrationStageId'>;
export type OrchestrationNamespace = `namespace:${string}`;
export type OrchestrationScope = `scope:${string}`;

export type OrchestrationPriority = 'critical' | 'high' | 'medium' | 'low' | 'background';
export const ORCHESTRATION_PRIORITIES = [
  'critical',
  'high',
  'medium',
  'low',
  'background',
] as const satisfies readonly OrchestrationPriority[];

export type OrchestrationTag<TTag extends string = string> = `tag:${TTag}`;
export type StageName<TName extends string = string> = `stage:${TName}`;
export type EventName<TEvent extends string = string> = `event:${TEvent}`;
export type EventChannel<TEvent extends string = string> = `channel:${TEvent}`;
export type StageDependency<TName extends string = string> = `dependency:${TName}`;
export type StageMetric<TKey extends string = string> = `metric:${TKey}`;
export type StageOutputKey<TName extends string = string> = `${TName}/output:${string}`;

export interface OrchestrationMetadata {
  readonly source: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly traceParent?: Brand<string, 'TraceParent'>;
}

export interface StageExecutionMetric {
  readonly metric: StageMetric;
  readonly value: number;
  readonly unit: 'count' | 'ms' | 'ratio';
  readonly measuredAt: string;
}

export interface StageContext {
  readonly tenant: OrchestrationTenant;
  readonly namespace: OrchestrationNamespace;
  readonly scope: OrchestrationScope;
  readonly runId: OrchestrationRunId;
  readonly metadata: OrchestrationMetadata;
  readonly tags: readonly OrchestrationTag[];
}

export interface StageRunInput<TPayload = unknown> {
  readonly stageName: StageName;
  readonly payload: Readonly<TPayload>;
  readonly context: StageContext;
}

export interface StageResult<TPayload = unknown> {
  readonly status: 'ok' | 'skipped';
  readonly output: TPayload;
  readonly metrics: readonly StageExecutionMetric[];
  readonly durationMs: number;
  readonly timestamp: string;
  readonly channel: EventChannel;
}

export interface StageErrorDetail {
  readonly code: Brand<string, 'StageErrorCode'>;
  readonly message: string;
  readonly path: readonly string[];
  readonly suggestions: readonly string[];
}

export interface StageFailure<TPayload = unknown> {
  readonly status: 'error';
  readonly output: null;
  readonly metrics: readonly StageExecutionMetric[];
  readonly durationMs: number;
  readonly timestamp: string;
  readonly channel: EventChannel;
  readonly error: StageErrorDetail & { payload?: TPayload };
}

export type StageExecution<TInput, TOutput> = StageResult<TOutput> | StageFailure<TInput>;

export interface StageDefinition<TName extends string = string, TInput = unknown, TOutput = unknown> {
  readonly name: StageName<TName>;
  readonly namespace: OrchestrationNamespace;
  readonly description: string;
  readonly dependencies: readonly StageName[];
  readonly tags: readonly OrchestrationTag[];
  readonly priority: OrchestrationPriority;
  run(input: StageRunInput<TInput>, context: StageContext): Promise<StageExecution<TInput, TOutput>>;
}

export interface NamedEventEnvelope<
  TEvent extends string = string,
  TPayload = JsonValue,
  TContext extends StageContext = StageContext,
> {
  readonly name: EventName<TEvent>;
  readonly channel: EventChannel<TEvent>;
  readonly payload: TPayload;
  readonly context: TContext;
  readonly emittedAt: string;
}

export interface StageEventRecord<TStageName extends StageName = StageName, TOutput = unknown> {
  readonly kind: 'stage';
  readonly stage: TStageName;
  readonly runId: OrchestrationRunId;
  readonly payload: NamedEventEnvelope<TStageName, TOutput>;
  readonly resolvedAt: string;
}

export type StageNames<TStages extends readonly StageDefinition[]> = TStages[number]['name'];

export type StagePayloadForKind<TStages extends readonly StageDefinition[], TStageName extends StageNames<TStages>> = Extract<
  TStages[number],
  { name: TStageName }
> extends StageDefinition<any, infer TInput, infer _TOutput>
  ? TInput
  : unknown;

export type StageOutputForKind<TStages extends readonly StageDefinition[], TStageName extends StageNames<TStages>> = Extract<
  TStages[number],
  { name: TStageName }
> extends StageDefinition<any, infer _TInput, infer TOutput>
  ? TOutput
  : never;

export type OrchestrationEvent<TStages extends readonly StageDefinition[]> =
  | {
      [TName in StageNames<TStages>]: StageEventRecord<TName, StageOutputForKind<TStages, TName>>;
    }[StageNames<TStages>]
  | { kind: 'terminal'; runId: OrchestrationRunId; resolvedAt: string };

export type ExpandPath<TTokens extends readonly string[]> = TTokens extends readonly [
  infer Head extends string,
  ...infer Tail,
]
  ? Head | `${Head}.${ExpandPath<Extract<Tail, readonly string[]>>}`
  : never;

export type EventPath<TEvent extends string> = ExpandPath<
  TEvent extends `${infer Head}.${infer Tail}` ? readonly [Head, Tail] : readonly [TEvent]
>;

export type StageDefinitionMap<TStages extends readonly StageDefinition[]> = {
  [Definition in TStages[number] as Definition['name']]: Definition;
};

export type MappedInputMap<TStages extends readonly StageDefinition[]> = {
  [Definition in TStages[number] as Definition['name']]: Definition extends StageDefinition<Definition['name'], infer TInput, any>
    ? TInput
    : never;
};

export type MappedOutputMap<TStages extends readonly StageDefinition[]> = {
  [Definition in TStages[number] as Definition['name']]: Definition extends StageDefinition<Definition['name'], any, infer TOutput>
    ? TOutput
    : never;
};

export const asTenant = (value: string): OrchestrationTenant => `tenant:${value}` as OrchestrationTenant;
export const asRunId = (value: string): OrchestrationRunId => `run:${value}` as OrchestrationRunId;
export const asStageId = (value: string): OrchestrationStageId => `stage:${value}` as OrchestrationStageId;

export const normalizeTags = (tags: readonly string[]): readonly OrchestrationTag[] =>
  tags.map((tag) => `tag:${tag}` as OrchestrationTag);

export const toEventName = <TEvent extends string>(kind: TEvent): EventName<TEvent> =>
  `event:${kind}` as EventName<TEvent>;

export const toChannel = <TEvent extends string>(kind: TEvent): EventChannel<TEvent> =>
  `channel:${kind}` as EventChannel<TEvent>;

export const toDependency = <TName extends string>(name: TName): StageDependency<TName> =>
  `dependency:${name}` as StageDependency<TName>;

export const toStage = <TName extends string>(name: TName): StageName<TName> => `stage:${name}` as StageName<TName>;

export const toStageResult = <TInput, TOutput>(
  run: {
    readonly id: string;
    readonly output: TOutput;
    readonly metrics: readonly StageExecutionMetric[];
    readonly durationMs: number;
    readonly metadata: { [k: string]: JsonValue };
    readonly metadataPatch?: Record<string, JsonValue>;
  },
): StageExecution<TInput, TOutput> => ({
  status: 'ok',
  output: run.output,
  metrics: run.metrics,
  durationMs: run.durationMs,
  timestamp: new Date().toISOString(),
  channel: `channel:${run.id}` as EventChannel,
});

export const isStageFailure = <TInput, TOutput>(
  value: StageExecution<TInput, TOutput>,
): value is StageFailure<TInput> => value.status === 'error';

export const isStageSuccess = <TInput, TOutput>(
  value: StageExecution<TInput, TOutput>,
): value is StageResult<TOutput> => value.status !== 'error';

export const toFailure = <TPayload>(
  code: string,
  message: string,
  payload?: TPayload,
): StageFailure<TPayload> => ({
  status: 'error',
  output: null,
  metrics: [],
  durationMs: 0,
  timestamp: new Date().toISOString(),
  channel: 'channel:orchestrator-failure',
  error: {
    code: `stage:${code}` as Brand<string, 'StageErrorCode'>,
    message,
    path: ['orchestrator'],
    suggestions: ['Review plugin graph', 'Check payload contracts'],
    payload,
  },
});

export type StageMetadataPatch<TPayload extends JsonObject = JsonObject> = {
  readonly update: Partial<OrchestrationMetadata>;
  readonly payload: TPayload;
  readonly tags: readonly OrchestrationTag[];
};

export const mergeMetadata = <TLeft extends OrchestrationMetadata, TRight extends OrchestrationMetadata>(
  left: TLeft,
  right: TRight,
): Prettify<DeepMerge<TLeft, TRight>> => ({
  ...left,
  ...right,
  updatedAt: right.updatedAt ?? left.updatedAt,
} as Prettify<DeepMerge<TLeft, TRight>>);
