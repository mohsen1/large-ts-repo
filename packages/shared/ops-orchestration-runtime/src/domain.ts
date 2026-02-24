import { Brand, DeepReadonly, KeyPaths, NonEmptyArray } from '@shared/type-level';

export const ORCHESTRATION_PHASES = ['intake', 'validate', 'plan', 'execute', 'verify', 'finalize'] as const;

export type OrchestratorPhase = (typeof ORCHESTRATION_PHASES)[number];
export type RuntimeNamespace = Brand<string, 'namespace'>;
export type StageIdentifier = Brand<string, 'stage-id'>;
export type TraceId = Brand<string, 'trace-id'>;
export type PluginId = Brand<string, 'plugin-id'>;
export type StageName<T extends string = string> = `stage:${T}`;
export type RuntimeArtifactPath<TStage extends StageIdentifier = StageIdentifier> = `artifact:${TStage}`;
export type SeverityLabel = 'critical' | 'high' | 'medium' | 'low';
export type VersionToken = Brand<string, 'orchestration-version'>;

export const PHASE_TO_LABEL: Record<OrchestratorPhase, StageName> = {
  intake: 'stage:intake',
  validate: 'stage:validate',
  plan: 'stage:plan',
  execute: 'stage:execute',
  verify: 'stage:verify',
  finalize: 'stage:finalize',
};

export interface PluginSignal {
  readonly key: StageName;
  readonly weight: Brand<number, 'signal-weight'>;
  readonly severity: SeverityLabel;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PluginInput<TPayload extends object = object> {
  readonly correlationId: Brand<string, 'correlation-id'>;
  readonly namespace: RuntimeNamespace;
  readonly startedAt: number;
  readonly tags: readonly string[];
  readonly phase: OrchestratorPhase;
  readonly payload: TPayload;
}

export interface PluginContext<TState extends object = object> {
  readonly traceId: TraceId;
  readonly phase: OrchestratorPhase;
  readonly state: DeepReadonly<TState>;
  readonly signalKeys: readonly KeyPaths<TState>[];
}

export interface PluginOutput<TPayload extends object = object> {
  readonly accepted: boolean;
  readonly stage: StageName;
  readonly payload: TPayload;
  readonly score: number;
  readonly warnings: readonly string[];
  readonly traceId: TraceId;
}

export interface StageDescriptor<TInput extends object = object, TOutput extends object = object> {
  readonly stageId: StageIdentifier;
  readonly stageName: StageName;
  readonly phase: OrchestratorPhase;
  readonly requires: NonEmptyArray<StageIdentifier> | readonly StageIdentifier[];
  readonly input: Readonly<TInput>;
  readonly output: Readonly<TOutput>;
  readonly path: RuntimeArtifactPath;
}

export interface OrchestrationGraphPlan<
  TNamespace extends RuntimeNamespace = RuntimeNamespace,
  TInput extends object = object,
  TOutput extends object = object,
  TPhases extends readonly OrchestratorPhase[] = readonly OrchestratorPhase[],
> {
  readonly namespace: TNamespace;
  readonly version: VersionToken;
  readonly phases: [...TPhases];
  readonly input: TInput;
  readonly output: TOutput;
  readonly stages: readonly StageDescriptor<TInput, TOutput>[];
}

export interface RuntimeArtifact<TPayload extends object = object> {
  readonly namespace?: RuntimeNamespace;
  readonly phase: OrchestratorPhase;
  readonly kind: StageName;
  readonly payload: TPayload;
  readonly traceId: TraceId;
}

export interface OrchestrationRuntimeConfig {
  readonly maxConcurrency: number;
  readonly timeoutMs: number;
  readonly retryBudget: number;
  readonly namespace: RuntimeNamespace;
  readonly pluginWhitelist: readonly StageName[];
}

export type RuntimeMetadata<TPlugin extends string = string> = {
  readonly namespace: RuntimeNamespace;
  readonly enabledPhases: readonly OrchestratorPhase[];
  readonly plugin: Brand<TPlugin, 'runtime-plugin'>;
  readonly tags: readonly string[];
};

export type StageExecutionRecord<TInput extends object = object, TOutput extends object = object> = {
  readonly phase: OrchestratorPhase;
  readonly phaseLabel: StageName<OrchestratorPhase>;
  readonly input: TInput;
  readonly output?: TOutput;
  readonly ok: boolean;
  readonly score: number;
};

export type OrchestrationEnvelope<TData extends readonly StageDescriptor[]> = {
  readonly namespace: RuntimeNamespace;
  readonly traceId: TraceId;
  readonly startedAt: number;
  readonly snapshots: {
    [K in keyof TData & string]: TData[K] extends StageDescriptor<infer TInput, infer TOutput>
      ? StageExecutionRecord<TInput, TOutput>
      : StageExecutionRecord;
  };
};

export function mapByPrefix<T extends Record<string, unknown>>(prefix: string): Array<keyof T> {
  return Object.keys({} as T).filter((key) => key.startsWith(prefix)) as Array<keyof T>;
}

export const DEFAULT_PHASES: readonly OrchestratorPhase[] = ORCHESTRATION_PHASES;

export function phaseLabel<T extends OrchestratorPhase>(phase: T): StageName<T> {
  return `stage:${phase}` as StageName<T>;
}

export function phaseFromLabel(label: StageName): OrchestratorPhase {
  return label.replace('stage:', '') as OrchestratorPhase;
}

export function makeTraceId(namespace: RuntimeNamespace): TraceId {
  return `${namespace}-trace-${Date.now()}-${Math.random().toString(36).slice(2)}` as TraceId;
}
