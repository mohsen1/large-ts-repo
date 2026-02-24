import type { Brand, NoInfer } from '@shared/type-level';
import type {
  ReadinessRunId,
  RecoveryReadinessPlan,
  ReadinessSignal,
  ReadinessTarget,
  ReadinessDirective,
} from './types';
import type { ReadinessPolicy } from './policy';

export type ReadinessLabNamespace = Brand<string, 'ReadinessLabNamespace'>;
export type ReadinessLabRunId = ReadinessRunId;
export type ReadinessLabPlanId = Brand<string, 'ReadinessLabPlanId'>;

export type ReadinessLabChannel = 'telemetry' | 'signal' | 'playbook' | 'control';
export type ReadinessLabChannelPath<TChannel extends ReadinessLabChannel = ReadinessLabChannel> = `${TChannel}/${string}`;
export type ReadinessLabStep = 'discover' | 'triage' | 'validate' | 'simulate' | 'execute' | 'review';
export type ReadinessLabStepPath<TStep extends ReadinessLabStep, T extends string = string> = `${TStep}/${T}`;
export type ReadinessLabStepTuple<T extends readonly ReadinessLabStep[]> = T extends readonly [infer Head extends ReadinessLabStep, ...infer Tail extends ReadinessLabStep[]]
  ? readonly [Head, ...ReadinessLabStepTuple<Tail>]
  : readonly [];

export type ReadinessLabEventKey<T extends string> = T extends `lab:${infer _}` ? T : `lab:${T}`;
export type ReadinessLabEventBus<TMap extends Record<string, unknown>> = {
  [K in keyof TMap as K extends string ? `event/${K}` : never]: TMap[K];
};

export type ReadinessLabDependencyTree<T extends ReadonlyArray<string>> = T extends readonly [infer Head, ...infer Tail]
  ? Head extends string
    ? {
        readonly [K in Head]: ReadinessLabDependencyTree<Tail extends ReadonlyArray<string> ? Tail : []>;
      }
    : never
  : Record<never, never>;

export type ReadinessLabPayloadForStep<TStep extends ReadinessLabStep> = TStep extends 'discover'
  ? { discoveredSignals: number }
  : TStep extends 'triage'
    ? { triagedSignals: number }
    : TStep extends 'validate'
      ? { violatedSignals: number }
      : TStep extends 'simulate'
        ? { scenarioCount: number }
        : TStep extends 'execute'
          ? { executedActions: number }
          : { reviewedSignals: number };

export type ReadinessLabStepPayload<
  TStep extends ReadinessLabStep = ReadinessLabStep,
  TContext extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> = {
  readonly step: TStep;
  readonly context: TContext;
  readonly payload: ReadinessLabPayloadForStep<TStep>;
  readonly score: number;
};

export interface ReadinessLabSignalEnvelope<TPayload extends Readonly<Record<string, unknown>> = Record<string, unknown>> {
  readonly envelopeId: ReadinessLabRunId;
  readonly namespace: ReadinessLabNamespace;
  readonly runId: ReadinessRunId;
  readonly planId: ReadinessLabPlanId;
  readonly version: number;
  readonly payload: TPayload;
}

export interface ReadinessLabSignalBucket {
  readonly runId: ReadinessLabRunId;
  readonly targetId: ReadinessTarget['id'];
  readonly signals: readonly ReadinessSignal[];
  readonly score: number;
}

export interface ReadinessLabWorkspaceModel {
  readonly workspaceId: ReadinessLabRunId;
  readonly tenant: string;
  readonly namespace: ReadinessLabNamespace;
  readonly planId: ReadinessLabPlanId;
  readonly channels: ReadonlySet<ReadinessLabChannel>;
  readonly signalBuckets: readonly ReadinessLabSignalBucket[];
  readonly stages: ReadonlyArray<ReadinessLabStep>;
}

export interface ReadinessLabExecutionContext {
  readonly tenant: string;
  readonly namespace: ReadinessLabNamespace;
  readonly runId: ReadinessLabRunId;
  readonly policy: ReadinessPolicy;
  readonly enabledChannels: ReadonlySet<ReadinessLabChannel>;
  readonly runLimit: number;
}

export interface ReadinessLabExecutionInput {
  readonly context: ReadinessLabExecutionContext;
  readonly plan: RecoveryReadinessPlan;
  readonly directives: readonly ReadinessDirective[];
  readonly targetSnapshot: readonly ReadinessTarget[];
}

export interface ReadinessLabExecutionOutput {
  readonly runId: ReadinessLabRunId;
  readonly planId: ReadinessLabPlanId;
  readonly generatedSignals: readonly ReadinessSignal[];
  readonly warnings: readonly string[];
  readonly [key: string]: unknown;
}

export interface ReadinessLabManifest<TSteps extends readonly ReadinessLabStep[]> {
  readonly tenant: string;
  readonly namespace: ReadinessLabNamespace;
  readonly runId: ReadinessLabRunId;
  readonly stepPath: ReadinessLabStepTuple<TSteps>;
  readonly stepCount: TSteps['length'];
}

export type ReadinessLabEventBusFromShape<TEventMap extends Record<string, unknown>> = ReadinessLabEventBus<
  { [K in keyof TEventMap as `channel/${Extract<K, string>}`]: TEventMap[K] }
>;

const normalizeTenant = (tenant: string): string => tenant.toLowerCase().trim();
const normalizeNamespace = (namespace: string): ReadinessLabNamespace => `${normalizeTenant(namespace)}:lab` as ReadinessLabNamespace;

export const makeReadinessLabNamespace = (tenant: string, namespace: string): ReadinessLabNamespace =>
  `${normalizeTenant(tenant)}:${normalizeNamespace(namespace)}` as ReadinessLabNamespace;

export const makeReadinessLabRunId = (
  tenant: string,
  namespace: string,
  seed: string,
): ReadinessLabRunId => `${normalizeTenant(tenant)}:${normalizeNamespace(namespace)}:${seed}` as ReadinessLabRunId;

export const makeReadinessLabPlanId = (planId: string, step: ReadinessLabStep): ReadinessLabPlanId =>
  `${planId}:${step}` as ReadinessLabPlanId;

export const makeReadinessLabChannelPath = <T extends ReadinessLabChannel>(
  channel: T,
  suffix: string,
): ReadinessLabChannelPath<T> => `${channel}/${suffix}` as ReadinessLabChannelPath<T>;

export const makeReadinessLabStepPath = <T extends ReadinessLabStep>(
  step: T,
  suffix: string,
): ReadinessLabStepPath<T> => `${step}/${suffix}` as ReadinessLabStepPath<T>;

export const buildReadinessLabManifest = <TSteps extends readonly ReadinessLabStep[]>(
  input: NoInfer<{
    tenant: string;
    namespace: string;
    runId: string;
    steps: TSteps;
  }>,
): ReadinessLabManifest<TSteps> =>
  ({
    tenant: input.tenant,
    namespace: makeReadinessLabNamespace(input.tenant, input.namespace),
    runId: makeReadinessLabRunId(input.tenant, input.namespace, input.runId),
    stepPath: input.steps as unknown as ReadinessLabStepTuple<TSteps>,
    stepCount: input.steps.length,
  }) satisfies ReadinessLabManifest<TSteps>;

export const buildBucket = (
  runId: ReadinessLabRunId,
  namespace: ReadinessLabNamespace,
  targetId: ReadinessTarget['id'],
  signals: ReadonlyArray<ReadinessSignal>,
): ReadinessLabSignalBucket => {
  const score = signals.reduce((acc, next) => acc + (['low', 'medium', 'high', 'critical'].indexOf(next.severity) + 1), 0);
  const bucket: ReadinessLabSignalBucket = {
    runId,
    targetId,
    signals,
    score,
  };
  return bucket;
};
