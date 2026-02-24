import {
  type Brand,
  type DeepReadonly,
  type KeyPaths,
  type NoInfer,
  type OmitNever,
  type PathTuple,
  type PathValue,
  type Prettify,
} from '@shared/type-level';
import {
  type AnyStreamingPlugin,
  type PluginInput,
  type PluginOutput,
  type StreamingPlugin,
  StreamingPluginKind,
} from '@domain/streaming-observability';
import {
  type CommandRunbook,
  type RecoverySignal,
  type RecoverySignalId,
  type TenantId,
  type WorkloadTopology,
  createTenantId,
} from '@domain/recovery-stress-lab';
import { type StreamHealthSignal } from '@domain/streaming-observability';

export type LabTenantId = Brand<TenantId, 'LabTenantId'>;
export type LabRunId = Brand<string, 'LabRunId'>;
export type LabPluginId = Brand<string, 'LabPluginId'>;

export type StageRoute = 'seed' | 'normalize' | 'score' | 'recommend';
export type StageRoutePath<T extends string = StageRoute> = T extends `${infer Head}.${infer Tail}`
  ? readonly [Head, ...StageRoutePath<Tail>]
  : readonly [T];

export type RouteToken<T extends string> = T extends `${infer _Prefix}.${infer Rest}` ? `${Rest}` : T;
export type RouteDigest<T extends string> = `stream-lab:${RouteToken<T>}`;

export type StageRouteTuple = StageRoutePath<`seed.${StageRoute}`>;

export type RecursiveSignalTuple<
  TSignals extends readonly RecoverySignal[],
  TAccum extends readonly unknown[] = []
> = TSignals extends readonly [infer THead, ...infer TTail]
  ? THead extends RecoverySignal
    ? RecursiveSignalTuple<
        TTail extends readonly RecoverySignal[] ? TTail : readonly [],
        readonly [...TAccum, readonly [THead['id'], THead]]
      >
    : RecursiveSignalTuple<TTail extends readonly RecoverySignal[] ? TTail : [], TAccum>
  : TAccum;

export type PluginByKind<
  TCatalog extends readonly AnyStreamingPlugin[],
  TKind extends AnyStreamingPlugin['name'],
> = Extract<TCatalog[number], { readonly name: TKind }>;

export type PluginInputOf<TPlugin extends AnyStreamingPlugin> = PluginInput<TPlugin>;
export type PluginOutputOf<TPlugin extends AnyStreamingPlugin> = PluginOutput<TPlugin>;

export type OutputByKind<
  TCatalog extends readonly AnyStreamingPlugin[],
  TKind extends TCatalog[number]['name'],
> = PluginOutputOf<PluginByKind<TCatalog, TKind>>;

export type InputByKind<
  TCatalog extends readonly AnyStreamingPlugin[],
  TKind extends TCatalog[number]['name'],
> = PluginInputOf<PluginByKind<TCatalog, TKind>>;

export type ChainByKind<TCatalog extends readonly AnyStreamingPlugin[], TInput> = readonly [
  ...Array<{
    readonly plugin: TCatalog[number];
    readonly input: TInput;
  }>,
];

export type KeySwap<T extends Record<string, unknown>, TPrefix extends string> = {
  [K in keyof T as `${TPrefix}:${string & K}`]: DeepReadonly<T[K]>;
};

export type KnownSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface StreamLabSignalEnvelope<TSignals extends readonly RecoverySignal[] = readonly RecoverySignal[]> {
  readonly tenantId: LabTenantId;
  readonly streamId: string;
  readonly signals: TSignals;
  readonly signalProfile: KeySwap<{
    criticalSignals: number;
    highSignals: number;
    mediumSignals: number;
    lowSignals: number;
  }, 'signal'>;
  readonly timestamp: string;
}

export interface StreamLabTopologyFingerprint {
  readonly streamId: string;
  readonly nodeCount: number;
  readonly edgeCount: number;
}

export interface StreamLabExecutionInput {
  readonly tenantId: LabTenantId;
  readonly streamId: string;
  readonly signals: readonly RecoverySignal[];
  readonly runbooks: readonly CommandRunbook[];
}

export interface StreamLabExecutionTrace {
  readonly runId: LabRunId;
  readonly pluginName: string;
  readonly pluginKind: StreamingPluginKind;
  readonly startedAt: string;
  readonly elapsedMs: number;
  readonly status: 'queued' | 'running' | 'complete' | 'failed';
}

export interface StreamLabExecutionResult {
  readonly tenantId: LabTenantId;
  readonly runId: LabRunId;
  readonly finalSignals: readonly StreamHealthSignal[];
  readonly topology: WorkloadTopology;
  readonly trace: readonly StreamLabExecutionTrace[];
  readonly recommendations: readonly string[];
}

export interface StreamLabNormalizedSignal {
  readonly signalId: RecoverySignalId;
  readonly className: RecoverySignal['class'];
  readonly level: StreamHealthSignal['level'];
  readonly score: number;
  readonly details: readonly string[];
}

export interface StreamLabScoredRun {
  readonly runId: LabRunId;
  readonly tenantId: LabTenantId;
  readonly streamId: string;
  readonly rankedSignals: readonly StreamLabNormalizedSignal[];
  readonly topologyDigest: string;
  readonly metrics: {
    readonly score: number;
    readonly riskLevel: KnownSeverity;
    readonly alertCount: number;
  };
}

export interface StreamLabRequest {
  readonly tenantId: LabTenantId;
  readonly streamId: string;
  readonly runbooks: readonly CommandRunbook[];
  readonly signals: readonly RecoverySignal[];
  readonly route: StageRouteTuple;
  readonly options: NoInfer<{
    readonly useAdaptiveScale: boolean;
    readonly includeDiagnostics: boolean;
    readonly pluginOrder: readonly StreamingPluginKind[];
    readonly maxExecutionMs: number;
  }>;
}

export interface StreamLabSessionEnvelope<T extends StreamLabRequest> {
  readonly request: T;
  readonly runId: LabRunId;
  readonly startedAt: string;
}

export interface RecommendationShape {
  readonly tenantId: TenantId;
  readonly streamId: string;
  readonly targetConfig: {
    readonly tenant: TenantId;
    readonly streamId: string;
    readonly targetRunbooks: readonly string[];
    readonly pluginNames: readonly string[];
  };
  readonly recommendations: readonly {
    readonly runbook: string;
    readonly confidence: number;
  }[];
  readonly window: {
    readonly windowId: string;
    readonly window: {
      start: number;
      end: number;
    };
    readonly targetMs: number;
    readonly actualMs: number;
    readonly violated: boolean;
  };
  readonly contextSummary: {
    readonly activePlugins: readonly string[];
    readonly profile: string;
  };
}

export interface StreamLabExecutionReport<TRequest extends StreamLabRequest = StreamLabRequest> {
  readonly request: StreamLabSessionEnvelope<TRequest>;
  readonly result: StreamLabExecutionResult;
  readonly metrics: StreamLabScoredRun;
  readonly chainOutput: RecommendationShape;
  readonly recommendationCount: number;
  readonly traces: readonly StreamLabExecutionTrace[];
}

export const normalizeTenant = (tenantId: string): LabTenantId => createTenantId(tenantId) as LabTenantId;

export const pickKeys = <TObject extends Record<string, unknown>>(value: TObject) => {
  const keys = Object.keys(value);
  return keys;
};

export const isSeedRoute = (route: readonly string[]): route is StageRouteTuple => {
  return route.length === 2 && route[0] === 'seed' && (route[1] === 'normalize' || route[1] === 'score' || route[1] === 'recommend');
};

export const routeTuples = (route: StageRouteTuple): PathTuple<{ readonly route: RouteDigest<string> }> => {
  return route as unknown as PathTuple<{ readonly route: RouteDigest<string> }>;
};

export const valueAtRoute = <TValue extends Record<string, unknown>, TPath extends string>(
  value: TValue,
  route: TPath,
): PathValue<TValue, TPath> => {
  const [, first, ...rest] = route.split('.') as Array<string>;
  let cursor: unknown = value[first];
  for (const token of rest) {
    if (cursor && typeof cursor === 'object' && token in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[token];
      continue;
    }
    return undefined as PathValue<TValue, TPath>;
  }
  return cursor as PathValue<TValue, TPath>;
};

export const signalKeys = <TSignals extends readonly RecoverySignal[]>(signals: TSignals) => {
  const paths = signals.map((signal): RecoverySignalId => signal.id);
  return paths satisfies ReadonlyArray<RecoverySignalId>;
};

export const signalPathIndex = <TSignalMap extends Record<string, RecoverySignal>>(
  signals: TSignalMap,
) => {
  const entries = Object.entries(signals);
  return {
    ...entries.reduce<Record<string, number>>((acc, [key, signal]) => {
      acc[key] = Number(signal.severity === 'critical');
      return acc;
    }, {}),
  } as Prettify<OmitNever<KeyPaths<TSignalMap>>> & Record<RecoverySignalId, number>;
};
