import { Brand } from '@shared/core';
import type { NoInfer } from '@shared/type-level/patterns';
import type { IncidentLabPlan, IncidentLabRun, IncidentLabScenario, IncidentLabSignal } from './types';
import {
  type GovernanceContext,
  createGovernanceTenantId,
  type PolicyProfile,
  type GovernanceSignal,
  type PolicyEnvelope,
  type GovernanceMatrix,
  type PolicyWindow,
  type GovernanceTenantId,
  type GovernanceEvaluation,
} from '@domain/recovery-lab-governance';

export const controlStages = ['prepare', 'compose', 'execute', 'telemetry', 'resolve', 'close'] as const;
export type ControlStage = (typeof controlStages)[number];

export const controlScopes = ['tenant', 'topology', 'signal', 'policy', 'runtime'] as const;
export type ControlScope = (typeof controlScopes)[number];

export const controlKinds = ['input', 'transform', 'simulate', 'observe', 'recommend', 'report'] as const;
export type ControlKind = (typeof controlKinds)[number];

export type ControlRunId = Brand<string, 'ControlRunId'>;
export type ControlArtifactId = Brand<string, 'ControlArtifactId'>;
export type ControlRegistryId = Brand<string, 'ControlRegistryId'>;
export type ControlTimelineBucket = Brand<string, 'ControlTimelineBucket'>;

export type ControlTag<T extends string = string> = `control:${T}`;
export type ControlMetricKey<T extends string = string> = `${T}::metric`;
export type ControlEventName<TScope extends ControlScope, TKind extends ControlKind, TIndex extends number = number> = `lab:${TScope}:${TKind}:${TIndex}`;
export type ControlEventBusId = Brand<string, 'ControlEventBusId'>;
export type ControlEvent = {
  readonly name: ControlEventName<ControlScope, ControlKind>;
  readonly bucket: ControlTimelineBucket;
  readonly emittedAt: string;
  readonly payload: unknown;
};

export type BrandedUnion<T extends string, B extends string> = Brand<T, B>;

export type VariadicJoin<T extends readonly string[], Separator extends string = ','> =
  T extends readonly [infer Head extends string, ...infer Tail extends readonly string[]]
    ? Tail['length'] extends 0
      ? Head
      : `${Head}${Separator}${VariadicJoin<Tail, Separator>}`
    : never;

export type ShiftTuple<T extends readonly unknown[]> = T extends readonly [any, ...infer Rest extends readonly unknown[]]
  ? Rest
  : [];

export type TailValue<T extends readonly unknown[]> = T extends readonly [...unknown[], infer Tail] ? Tail : never;

export type RepeatTuple<T, N extends number, R extends readonly T[] = []> = R['length'] extends N
  ? R
  : RepeatTuple<T, N, [...R, T]>;

export type RecursiveControlTuple<T extends readonly unknown[]> =
  T extends readonly [infer Head, ...infer Tail extends readonly unknown[]]
    ? readonly [Head, ...RecursiveControlTuple<Tail>]
    : readonly [];

export type TupleLength<T extends readonly unknown[]> = T['length'];
export type ControlLastTupleItem<T extends readonly unknown[]> = T extends readonly [...unknown[], infer Tail] ? Tail : never;

export interface ControlPluginConfig<TScope extends ControlScope = ControlScope, TKind extends ControlKind = ControlKind> {
  readonly scope: TScope;
  readonly kind: TKind;
  readonly version: `${number}.${number}.${number}`;
  readonly tags: readonly string[];
  readonly metadata: {
    readonly tenant: string;
    readonly namespace: string;
  };
}

export type ControlTemplate<T extends readonly string[]> = {
  [K in T[number] as `tpl:${K & string}`]: { readonly key: K; readonly active: true };
};

export interface ControlContext<TConfig extends Record<string, unknown> = Record<string, unknown>> {
  readonly runId: ControlRunId;
  readonly namespace: string;
  readonly at: string;
  readonly tenantId: string;
  readonly config: TConfig;
}

export interface ControlArtifactEnvelope<TPayload = unknown> {
  readonly id: ControlArtifactId;
  readonly runId: ControlRunId;
  readonly title: string;
  readonly payload: TPayload;
  readonly createdAt: string;
}

export type ControlArtifactPayload<TSignals extends readonly IncidentLabSignal['kind'][]> = {
  readonly runId: ControlRunId;
  readonly signalCount: number;
  readonly signals: SignalMatrix<TSignals>;
};

export type ControlPolicyInput<TSignals extends readonly IncidentLabSignal['kind'][]> = {
  readonly scenario: IncidentLabScenario;
  readonly plan: IncidentLabPlan;
  readonly signals: TSignals;
  readonly governanceSignals: readonly GovernanceSignal[];
};

export type ControlPolicyOutput<TSignals extends readonly IncidentLabSignal['kind'][]> = {
  readonly signals: ControlPolicyInput<TSignals>['signals'];
  readonly readinessScore: number;
  readonly warnings: readonly string[];
  readonly policy: Readonly<PolicyProfile>;
};

export type ControlTelemetry<TScenario extends IncidentLabScenario = IncidentLabScenario> = {
  readonly scenarioId: TScenario['id'];
  readonly planId: IncidentLabPlan['id'];
  readonly runId: ControlRunId;
  readonly latency: readonly number[];
  readonly errors: readonly string[];
};

export type RemapPolicyMetrics<T extends Record<string, unknown>> = {
  [K in keyof T as `metric:${string & K}`]: T[K];
};

export type SignalMatrix<T extends readonly string[]> = {
  [K in T[number] as `${K & string}::bucket`]: {
    readonly kind: K & string;
    readonly score: number;
  };
};

export type ControlTelemetryEnvelope<TSignals extends readonly IncidentLabSignal['kind'][]> = {
  readonly runId: ControlRunId;
  readonly scenarioId: IncidentLabScenario['id'];
  readonly signals: SignalMatrix<TSignals>;
  readonly matrix: Readonly<{
    [K in IncidentLabSignal['kind']]: readonly IncidentLabSignal[];
  }>;
};

export interface ControlRunEnvelope<
  TSignals extends readonly IncidentLabSignal['kind'][] = readonly IncidentLabSignal['kind'][],
> {
  readonly id: ControlRunId;
  readonly stage: ControlStage;
  readonly scenario: IncidentLabScenario;
  readonly events: readonly ControlEvent[];
  readonly artifacts: readonly ControlArtifactEnvelope<ControlArtifactPayload<TSignals>>[];
};

export interface ControlRegistryState {
  readonly registryId: ControlRegistryId;
  readonly createdAt: string;
  readonly stageOrder: readonly ControlStage[];
}

export interface ControlRegistryManifest {
  readonly registry: ControlRegistryState;
  readonly pluginCount: number;
  readonly byScope: { [K in ControlScope]: number };
  readonly byKind: { [K in ControlKind]: number };
}

export interface ControlRunResult {
  readonly runId: IncidentLabRun['runId'];
  readonly scenarioId: IncidentLabScenario['id'];
  readonly stage: ControlStage;
  readonly score: number;
  readonly output: string[];
}

export type PolicyEnvelopeFromSignals<TSignals extends readonly IncidentLabSignal['kind'][]> = TSignals extends readonly []
  ? {
      readonly noSignals: true;
      readonly profile: never;
      readonly matrix: never;
      readonly window: never;
      readonly warnings: never;
    }
  : {
      readonly profile: PolicyProfile;
      readonly window: PolicyWindow;
      readonly matrix: GovernanceMatrix;
      readonly warnings: readonly string[];
    };

export interface ScenarioGovernanceEnvelope<TSignals extends readonly IncidentLabSignal['kind'][] = readonly IncidentLabSignal['kind'][]> {
  readonly scenarioId: IncidentLabScenario['id'];
  readonly tenant: GovernanceTenantId;
  readonly context: GovernanceContext;
  readonly policyEnvelope: PolicyEnvelope;
  readonly evaluation: GovernanceEvaluation;
  readonly policySignalIndex: PolicyEnvelopeFromSignals<TSignals>;
}

export type ControlWorkspaceConfig = {
  readonly namespace: string;
  readonly activeScopes: readonly ControlScope[];
  readonly preferredKind: ControlKind;
};

export const createControlRunId = (seed: string): ControlRunId => `${seed}:${Date.now()}` as ControlRunId;

export const createControlArtifactId = (seed: string): ControlArtifactId => `${seed}:artifact:${Date.now()}` as ControlArtifactId;

export const buildControlEventName = <TKind extends ControlKind, TScope extends ControlScope, TIndex extends number>(
  scope: TScope,
  kind: TKind,
  index: NoInfer<TIndex>,
): ControlEventName<TScope, TKind, TIndex> => `lab:${scope}:${kind}:${index}`;

export const createControlPolicySignals = <TSignals extends readonly IncidentLabSignal['kind'][]>(
  signals: NoInfer<TSignals>,
): SignalMatrix<TSignals> => {
  const output: Record<string, { readonly kind: string; readonly score: number }> = {};
  for (const signal of signals) {
    output[`${signal}::bucket`] = {
      kind: signal,
      score: 0,
    };
  }
  return output as SignalMatrix<TSignals>;
};

export const createControlWorkspaceId = (namespace: string): string => `${namespace}:workspace:${Date.now()}`;

export const createGovernanceContext = (seed: string, domain = 'incident-lab'): GovernanceContext => ({
  tenantId: createGovernanceTenantId(seed),
  timestamp: new Date().toISOString(),
  domain,
  region: 'global',
  state: 'active',
});

export const toArtifactEvents = <TSignals extends readonly IncidentLabSignal['kind'][]>({
  scenario,
  run,
  signals,
}: {
  readonly scenario: IncidentLabScenario;
  readonly run: IncidentLabRun;
  readonly signals: TSignals;
}): ControlRunEnvelope<TSignals> => {
  const runId = createControlRunId(`${run.runId}:artifact`);
  return {
    id: createControlRunId(`${scenario.id}:artifact`),
    stage: 'compose',
    scenario,
    events: run.results.map((entry, index) => ({
      name: buildControlEventName('policy', 'observe', index),
      bucket: `bucket:${entry.stepId}` as ControlTimelineBucket,
      emittedAt: entry.startAt,
      payload: {
        result: entry.status,
        logs: entry.logs,
      },
    })),
    artifacts: [
      {
        id: createControlArtifactId(`${scenario.id}:signal`),
        runId,
        title: `${scenario.id}:${signals.length}:signals`,
        payload: {
          runId,
          signalCount: run.results.length,
          signals: createControlPolicySignals(signals),
        },
        createdAt: new Date().toISOString(),
      },
    ],
  };
};

export type AnyControlInput = ControlPolicyInput<readonly IncidentLabSignal['kind'][]>;
export type AnyControlOutput = ControlPolicyOutput<readonly IncidentLabSignal['kind'][]>;

export const controlStageOrder = <const TStages extends readonly ControlStage[]>(stages: TStages): readonly ControlStage[] =>
  stages.length > 0 ? [...stages] : controlStages;

export const mergePolicyWarnings = (
  left: readonly string[],
  right: readonly string[],
): readonly string[] =>
  [...new Set([...left, ...right])].toSorted((left, right) => left.localeCompare(right));
