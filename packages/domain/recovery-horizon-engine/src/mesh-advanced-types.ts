import type { Brand, NoInfer, RecursivePath } from '@shared/type-level';
import type {
  HorizonSignal,
  HorizonPlan,
  JsonLike,
  PluginConfig,
  PluginContract,
  PluginStage,
  RunId,
  TimeMs,
} from './types.js';
import { horizonBrand } from './types.js';

export type WindowTuple = readonly PluginStage[];

export type BuildWindowKey<TWindow extends WindowTuple> = TWindow extends readonly [infer Head extends PluginStage, ...infer Rest extends PluginStage[]]
  ? `${Head}${Rest extends readonly [] ? '' : `>${BuildWindowKey<Rest & WindowTuple>}`}`
  : 'empty';

export type BrandedWindow<TWindow extends WindowTuple> = Brand<string, `window:${BuildWindowKey<TWindow>}`>;

export type StageTransitionPairs<TWindow extends WindowTuple> = TWindow extends readonly [
  infer Left extends PluginStage,
  infer Right extends PluginStage,
  ...infer Rest extends PluginStage[],
]
  ? [`${Left}:${Right}`, ...StageTransitionPairs<[Right, ...Rest & WindowTuple]>]
  : [];

export type StageReachabilityMap<TWindow extends WindowTuple> = {
  readonly [T in TWindow[number]]: {
    readonly stage: T;
    readonly upstream: readonly {
      readonly source: TWindow[number];
    }[];
    readonly downstream: readonly {
      readonly target: TWindow[number];
    }[];
  };
};

export type StageReachabilityMutable<TWindow extends WindowTuple> = {
  -readonly [T in TWindow[number]]: {
    stage: T;
    upstream: Array<{ readonly source: TWindow[number] }>;
    downstream: Array<{ readonly target: TWindow[number] }>;
  };
};

export type ContractByStage<
  TWindow extends WindowTuple,
  TContracts extends readonly PluginContract<any, any, any>[],
> = {
  [K in TWindow[number]]: Extract<TContracts[number], { kind: K }>;
};

export type RuntimePayloadSignature<TPayload> = TPayload extends Record<string, infer Shape>
  ? keyof Shape extends never
    ? 'empty'
    : `${string & keyof Shape}`
  : 'opaque';

export type TraceTag<TWindow extends WindowTuple> = `trace:${BuildWindowKey<NormalizeWindow<TWindow>>}`;

export type NormalizeWindow<TWindow extends WindowTuple> = {
  readonly [I in keyof TWindow]: TWindow[I] extends PluginStage ? TWindow[I] : never;
};

export type StageMetricsBySignal<TPayload> = TPayload extends { severity: infer Severity }
  ? Severity extends 'critical' | 'high' | 'medium' | 'low'
    ? Record<Severity, number>
    : Record<'low', number>
  : Record<'low', number>;

export interface WindowEnvelope<TWindow extends WindowTuple> {
  readonly window: BrandedWindow<TWindow>;
  readonly stages: NormalizeWindow<TWindow>;
  readonly path: RecursivePath<{ window: string; stages: string }>;
  readonly signature: BuildWindowKey<TWindow>;
}

export interface ContractMesh<TWindow extends WindowTuple> {
  readonly window: WindowEnvelope<TWindow>;
  readonly contracts: ContractByStage<
    TWindow,
    readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[]
  >;
}

export interface ConstraintDigest {
  readonly at: TimeMs;
  readonly path: string;
  readonly score: number;
}

type StageWindowRecordEntry<TWindow extends WindowTuple> = {
  readonly stage: TWindow[number];
  readonly index: number;
};

export type StageWindowRecord<TWindow extends WindowTuple> = {
  readonly [K in TWindow[number]]: StageWindowRecordEntry<TWindow>;
};

export type StageSequence<TWindow extends WindowTuple> = TWindow extends readonly [
  infer Head extends PluginStage,
  ...infer Rest extends PluginStage[],
]
  ? readonly [Head, ...StageSequence<Rest & WindowTuple>]
  : readonly [];

export interface MeshDraft<TWindow extends WindowTuple, TPayload = JsonLike> {
  readonly tenantId: string;
  readonly window: BrandedWindow<TWindow>;
  readonly contracts: readonly PluginContract<TWindow[number], PluginConfig<TWindow[number], TPayload>, TPayload>[];
}

export type ZipTuples<TA extends readonly unknown[], TB extends readonly unknown[]> = TA extends readonly [infer A0, ...infer AR]
  ? TB extends readonly [infer B0, ...infer BR]
    ? [[A0, B0], ...ZipTuples<AR, BR>]
    : []
  : [];

export const normalizeWindow = <TWindow extends WindowTuple>(window: NoInfer<TWindow>): NormalizeWindow<TWindow> =>
  window as NormalizeWindow<TWindow>;

export const makeWindowSignature = <TWindow extends WindowTuple>(window: NoInfer<TWindow>): BuildWindowKey<TWindow> =>
  window.join('>') as BuildWindowKey<TWindow>;

export const makeWindowId = <TWindow extends WindowTuple>(
  tenantId: string,
  window: NoInfer<TWindow>,
): WindowEnvelope<TWindow> => {
  const signature = makeWindowSignature(window);
  return {
    window: `${tenantId}:${signature}` as BrandedWindow<TWindow>,
    stages: normalizeWindow(window),
    path: `window:${signature}` as RecursivePath<{ window: string; stages: string }>,
    signature,
  };
};

export const makeWindowTuple = <TWindow extends WindowTuple>(window: NoInfer<TWindow>): StageTuple<TWindow> =>
  [...window] as StageTuple<TWindow>;

type StageTuple<T extends readonly PluginStage[]> = readonly [...T];

export const traceWindow = <TWindow extends WindowTuple>(
  tenantId: string,
  window: NoInfer<TWindow>,
  nowTime: TimeMs = horizonBrand.fromTime(Date.now()),
): TraceTag<TWindow> => {
  const tag = makeWindowSignature(window);
  return (tag === 'empty' ? `trace:${tenantId}` : `${tenantId}:${tag}`) as TraceTag<TWindow>;
};

export const collectContractsByWindow = <
  TWindow extends WindowTuple,
  TContracts extends readonly PluginContract<PluginStage, PluginConfig<PluginStage, JsonLike>, JsonLike>[],
>(
  contracts: TContracts,
  stageWindow: NoInfer<TWindow>,
): readonly Extract<TContracts[number], { kind: TWindow[number] }>[] => {
  const map = new Map<PluginStage, TContracts[number]>();
  for (const contract of contracts) {
    map.set(contract.kind, contract as TContracts[number]);
  }

  const entries: Extract<TContracts[number], { kind: TWindow[number] }>[] = [];
  for (const stage of stageWindow) {
    const contract = map.get(stage);
    if (contract) {
      entries.push(contract as Extract<TContracts[number], { kind: TWindow[number] }>);
    }
  }
  return entries;
};

export const buildTransitionTuples = <TWindow extends WindowTuple>(
  window: NoInfer<TWindow>,
): StageTransitionPairs<TWindow> => {
  const pairs = [] as string[];
  for (let index = 0; index + 1 < window.length; index += 1) {
    const left = window[index];
    const right = window[index + 1];
    pairs.push(`${left}:${right}`);
  }
  return pairs as unknown as StageTransitionPairs<TWindow>;
};

export const buildReachability = <TWindow extends WindowTuple>(
  window: NoInfer<TWindow>,
): StageReachabilityMap<TWindow> => {
  const ordered = normalizeWindow(window);
  const entries = Object.create(null) as StageReachabilityMutable<TWindow>;
  for (let index = 0; index < ordered.length; index += 1) {
    const stage = ordered[index];
    const upstream: Array<{ readonly source: TWindow[number] }> = [];
    const downstream: Array<{ readonly target: TWindow[number] }> = [];

    for (let inner = 0; inner < ordered.length; inner += 1) {
      if (inner < index) {
        upstream.push({ source: ordered[inner] });
      } else if (inner > index) {
        downstream.push({ target: ordered[inner] });
      }
    }

    entries[stage as TWindow[number]] = {
      stage,
      upstream,
      downstream,
    };
  }

  return entries as StageReachabilityMap<TWindow>;
};

export const deriveConstraintDigest = <TWindow extends WindowTuple>(
  window: NoInfer<TWindow>,
): readonly ConstraintDigest[] => {
  const entries = buildReachability(window);
  const digest: ConstraintDigest[] = [];

  for (const key of window) {
    const info = entries[key as TWindow[number]];
    const score = horizonBrand.fromTime(info.upstream.length + info.downstream.length);
    digest.push({
      at: now(),
      path: `${key}:${info.upstream.length}:${info.downstream.length}`,
      score: score as number,
    });
  }

  return digest;
};

export const aggregateSignalTrace = <TWindow extends WindowTuple, TPayload extends JsonLike>(
  plan: HorizonPlan<PluginStage>,
  signals: readonly HorizonSignal<PluginStage, TPayload>[],
): SignalTraceTuple<TWindow> => {
  const traces = signals.map((signal) => ({
    stage: signal.kind as TWindow[number],
    elapsedMs: horizonBrand.fromTime(Math.max(0, Number(signal.startedAt) || 0)),
  }));
  return traces as SignalTraceTuple<TWindow>;
};

export const toRunId = (tenantId: string, planId: RunId): RunId =>
  horizonBrand.fromRunId(`${tenantId}:${planId}` as string);

export type StageTrace = {
  readonly stage: PluginStage;
  readonly elapsedMs: TimeMs;
};

export interface SignalTraceTuple<TWindow extends WindowTuple> extends Array<StageTrace> {
  readonly [index: number]: StageTrace;
}

const now = (): TimeMs => horizonBrand.fromTime(Date.now()) as TimeMs;

export const stageSignature = <TWindow extends WindowTuple>(window: NoInfer<TWindow>): BuildWindowKey<TWindow> =>
  window.join('.') as BuildWindowKey<TWindow>;
