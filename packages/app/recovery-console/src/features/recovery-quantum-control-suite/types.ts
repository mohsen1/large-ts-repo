import type { Brand } from '@shared/typed-orchestration-core/brands';
import { asBrand, type Brand as BrandType } from '@shared/typed-orchestration-core/brands';
import type { NoInfer, asTuple, Head } from '@shared/typed-orchestration-core/tuple-utils';
import type { PluginDependency, PluginLifecycle, PluginDefinition, PluginName } from '@shared/typed-orchestration-core/registry';

export type QuantumTenantId = Brand<string, 'TenantId'>;
export type QuantumRunId = Brand<string, 'RunId'>;
export type QuantumSessionId = Brand<string, 'SessionId'>;
export type QuantumScopeId = Brand<string, 'ScopeId'>;

export type SignalKind = 'policy' | 'signal' | 'control' | 'metric';
export type SignalWeight = 'critical' | 'high' | 'medium' | 'low';
export const allSignalWeights = ['critical', 'high', 'medium', 'low'] as const satisfies readonly SignalWeight[];
export type AllSignalWeights = typeof allSignalWeights;
export type QuantumCommand = 'throttle' | 'reroute' | 'synchronize' | 'freeze';
export type PlanShape = 'linear' | 'mesh' | 'adaptive';
export const supportedPlanShapes = ['linear', 'mesh', 'adaptive'] as const satisfies readonly PlanShape[];
export type SupportedPlanShape = typeof supportedPlanShapes[number];

export type SignalId<TPrefix extends string = 'signal'> = `${TPrefix}-${string}`;
export type QuantumStageName = `stage:${string}`;

export const makeRunId = (seed: string): QuantumRunId => asBrand(seed, 'RunId');
export const makeTenantId = (seed: string): QuantumTenantId => asBrand(seed, 'TenantId');
export const makeStage = (seed: string): QuantumStageName => `stage:${seed}` as QuantumStageName;
export const makeStageFromParts = (segment: string, index: number = 0): QuantumStageName =>
  `stage:${segment}-${index}` as QuantumStageName;
export const makePlanTag = (shape: PlanShape): `plan:${PlanShape}` => `plan:${shape}` as const;
export const makeSessionId = (runId: QuantumRunId): QuantumSessionId => asBrand(`session-${runId}`, 'SessionId');
export const makeScopeId = (seed: string): QuantumScopeId => asBrand(seed, 'ScopeId');

export type SignalMeta = {
  readonly id: SignalId<'signal'>;
  readonly tenant: QuantumTenantId;
  readonly timestamp: string;
  readonly kind: SignalKind;
  readonly weight: SignalWeight;
  readonly actor: string;
  readonly channel: string;
  readonly note: string;
};

export type SignalEnvelope = {
  readonly id: `envelope-${string}`;
  readonly runId: QuantumRunId;
  readonly recordedAt: string;
  readonly values: readonly SignalMeta[];
};

export type PolicyDirective = {
  readonly id: `directive:${string}`;
  readonly command: QuantumCommand;
  readonly reason: string;
  readonly priority: number;
  readonly dependencies: readonly string[];
  readonly expiresAt?: string;
};

export type StageArtifact = {
  readonly stage: QuantumStageName;
  readonly stageRunId: QuantumRunId;
  readonly directives: readonly PolicyDirective[];
  readonly artifactPayload: Readonly<Record<string, string | number | boolean>>;
};

export interface QuantumInput {
  readonly runId: QuantumRunId;
  readonly tenant: QuantumTenantId;
  readonly shape: PlanShape;
  readonly stage: QuantumStageName;
  readonly signals: SignalEnvelope;
  readonly budgetMs: number;
}

export interface QuantumOutput {
  readonly runId: QuantumRunId;
  readonly executedAt: string;
  readonly summary: `summary:${string}`;
  readonly stages: readonly StageArtifact[];
  readonly directives: readonly PolicyDirective[];
  readonly status: 'ok' | 'warn' | 'error';
}

export type QuantumTelemetryMetric = {
  readonly id: `metric:${string}`;
  readonly path: string;
  readonly value: number;
  readonly unit: string;
  readonly timestamp: string;
};

export type TimelineMarker = {
  readonly stamp: string;
  readonly phase: string;
  readonly value: string;
  readonly weight: number;
};

export type PluginPayload = {
  readonly output: QuantumOutput;
  readonly input: QuantumInput;
  readonly markers: readonly TimelineMarker[];
};

export type PluginSeed = {
  readonly name: PluginName;
  readonly namespace: `namespace:${string}`;
  readonly version: `v${number}.${number}`;
  readonly tags: readonly string[];
  readonly dependsOn: readonly PluginDependency<PluginName>[];
  readonly description: string;
};

export type PluginDefinitionMap = {
  readonly normalize: PluginDefinition<QuantumInput, QuantumOutput, PluginName>;
  readonly score: PluginDefinition<QuantumOutput, QuantumOutput, PluginName>;
  readonly policy: PluginDefinition<QuantumOutput, QuantumOutput, PluginName>;
};

export type QuantumFilter<TValue, TField extends keyof TValue> = (
  value: TValue,
  ...filters: [NoInfer<TValue[TField]>]
) => boolean;

export type StageStatusMap = {
  [Stage in QuantumStageName as `${Stage}:status`]: 'active' | 'pending' | 'complete' | 'failed';
};

export const isCritical = (signal: SignalMeta): signal is SignalMeta & { readonly weight: 'critical' } => signal.weight === 'critical';

export const isHigh = (signal: SignalMeta): boolean => signal.weight === 'high';

export const sortSignalsByWeight = (signals: readonly SignalMeta[]): SignalMeta[] =>
  [...signals].sort((left, right) => {
    const order = ['low', 'medium', 'high', 'critical'];
    return order.indexOf(left.weight) - order.indexOf(right.weight);
  });

export const criticalityScore = (signals: readonly SignalMeta[]): number =>
  signals.reduce(
    (total, signal) =>
      total +
      ({
        critical: 4,
        high: 3,
        medium: 2,
        low: 1,
      }[signal.weight] ?? 0),
    0,
  );

export const summarizeSignals = (signals: readonly SignalMeta[]) => {
  const ordered = sortSignalsByWeight(signals);
  const buckets = ordered.reduce(
    (acc, signal) => {
      acc.set(signal.weight, (acc.get(signal.weight) ?? 0) + 1);
      return acc;
    },
    new Map<SignalWeight, number>(),
  );

  return {
    ordered,
    score: criticalityScore(signals),
    buckets,
    total: signals.length,
  };
};

export const summarizeSignalsByBuckets = (signals: readonly SignalMeta[]) => {
  const summary = summarizeSignals(signals);
  const weighted = {
    critical: signals.filter((signal) => signal.weight === 'critical'),
    high: signals.filter((signal) => signal.weight === 'high'),
    medium: signals.filter((signal) => signal.weight === 'medium'),
    low: signals.filter((signal) => signal.weight === 'low'),
  } as const;
  return {
    ...summary,
    buckets: weighted,
  };
};

export const asStageArtifact = (output: QuantumOutput, runId: QuantumRunId): StageArtifact => ({
  stage: makeStage('runtime'),
  stageRunId: runId,
  directives: output.directives,
  artifactPayload: {
    summary: output.summary,
    directives: output.directives.length,
  },
});

export const buildEmptySignalEnvelope = (runId: QuantumRunId): SignalEnvelope => ({
  id: `envelope-${runId}` as const,
  runId,
  recordedAt: new Date().toISOString(),
  values: [],
});
