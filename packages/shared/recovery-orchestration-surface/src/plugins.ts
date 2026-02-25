import type {
  SurfaceLaneId,
  SurfacePluginId,
  SurfaceRuntimeContext,
  SurfaceWorkspaceId,
  SurfaceTelemetryId,
  SurfaceSignalId,
} from './identity';
import type {
  PluginInputForKind,
  PluginOutputForKind,
  SurfaceContextSchema,
  SurfaceLaneKind,
  SurfacePluginContract,
  ExtendedSurfaceRuntimeState,
  SurfaceSignalEnvelope,
} from './contracts';
import { NoInfer } from '@shared/type-level';

export type SurfacePluginEvent<TPayload extends Record<string, unknown> = Record<string, unknown>> = {
  readonly eventId: string;
  readonly pluginId: SurfacePluginId;
  readonly kind: SurfaceLaneKind;
  readonly payload: TPayload;
  readonly createdAt: number;
  readonly telemetry?: SurfaceTelemetryId;
};

export interface SurfacePluginRunInput<TKind extends SurfaceLaneKind, TInput extends Record<string, unknown>> {
  readonly kind: TKind;
  readonly data: TInput;
  readonly context: SurfaceRuntimeContext;
  readonly signal: SurfaceSignalEnvelope;
}

export interface SurfacePluginRunOutput<TKind extends SurfaceLaneKind, TOutput extends Record<string, unknown>> {
  readonly kind: TKind;
  readonly data: TOutput;
  readonly state: ExtendedSurfaceRuntimeState;
  readonly generatedSignals: readonly SurfaceSignalId[];
}

type PluginTuple = readonly SurfacePluginContract[];
type PluginRunOutput<TKind extends SurfaceLaneKind, TOutput extends Record<string, unknown>> = SurfacePluginRunOutput<
  TKind,
  TOutput
> & {
  readonly kinded: TKind;
  readonly eventId: string;
  readonly pluginId: SurfacePluginId;
  readonly createdAt: number;
  readonly telemetry: SurfaceTelemetryId;
};

type PluginKindMap<TCatalog extends PluginTuple> = {
  [Plugin in TCatalog[number] as Plugin['id']]: Plugin['kind'];
};

type MergePluginCatalog<TCatalog extends PluginTuple> = {
  [Name in keyof PluginKindMap<TCatalog>]: PluginKindMap<TCatalog>[Name];
};

type NoInferStrict<T> = [T][T extends unknown ? 0 : never];

export type PluginInputEnvelope<
  TCatalog extends PluginTuple,
  TKind extends SurfaceLaneKind,
> = {
  readonly value: NoInferStrict<PluginInputForKind<TCatalog, TKind>>;
  readonly context: SurfaceRuntimeContext;
};

export type PluginOutputEnvelope<
  TCatalog extends PluginTuple,
  TKind extends SurfaceLaneKind,
> = SurfacePluginRunOutput<TKind, PluginOutputForKind<TCatalog, TKind>>;

export interface SurfacePluginWorkspaceState {
  readonly workspaceId: SurfaceWorkspaceId;
  readonly currentLane: SurfaceLaneId;
  readonly stage: ExtendedSurfaceRuntimeState['stage'];
  readonly pluginCount: number;
  readonly signalsPerMinute: number;
}

export class SurfacePlugin {
  readonly #id: SurfacePluginId;
  readonly #kind: SurfaceLaneKind;
  readonly #lane: SurfaceLaneId;
  readonly #workspaceId: SurfaceWorkspaceId;
  readonly #telemetryId: SurfaceTelemetryId;
  readonly #run: (input: unknown, context: SurfaceRuntimeContext) => Promise<unknown> | unknown;

  constructor(plugin: SurfacePluginContract, private readonly telemetrySignal: SurfaceSignalId) {
    this.#id = plugin.id;
    this.#kind = plugin.kind;
    this.#lane = plugin.lane;
    this.#workspaceId = plugin.workspaceId;
    this.#telemetryId = plugin.telemetryId;
    this.#run = (input, context) => plugin.run(input as Record<string, unknown>, context);
  }

  get id(): SurfacePluginId {
    return this.#id;
  }

  get kind(): SurfaceLaneKind {
    return this.#kind;
  }

  get lane(): SurfaceLaneId {
    return this.#lane;
  }

  get workspaceId(): SurfaceWorkspaceId {
    return this.#workspaceId;
  }

  get telemetryId(): SurfaceTelemetryId {
    return this.#telemetryId;
  }

  async execute<TInput extends Record<string, unknown>, TOutput extends Record<string, unknown>>(
    input: NoInferStrict<TInput>,
    context: NoInferStrict<SurfaceRuntimeContext>,
    signal: SurfaceSignalEnvelope,
  ): Promise<PluginRunOutput<SurfaceLaneKind, TOutput>> {
    const state: ExtendedSurfaceRuntimeState = {
      workspaceId: context.workspaceId,
      stage: context.stage,
      tags: ['runtime'],
      signalWindowMs: 10_000,
      stageClock: `${Date.now()}:${this.#id}`,
      signalsPerMinute: 60,
      activePluginIds: [this.#id],
      nextTickAt: Date.now() + 100,
    };
    const result = (await this.#run(input, context)) as TOutput;
    const generatedSignals: SurfaceSignalId[] = [`${signal.signalId}:${this.#id}` as SurfaceSignalId];
    return {
      kind: this.#kind,
      data: result,
      state,
      generatedSignals,
      eventId: `${this.#id}:run`,
      pluginId: this.#id,
      createdAt: Date.now(),
      kinded: this.#kind,
      telemetry: this.#telemetryId,
    };
  }

  identityTag(): `surface-plugin:${SurfacePluginId}` {
    return `surface-plugin:${this.#id}`;
  }

  toString(): string {
    return `${this.#workspaceId}#${this.#id} via ${this.telemetrySignal}`;
  }
}

export type PluginAdapter<
  TCatalog extends readonly SurfacePluginContract[] = readonly SurfacePluginContract[],
  TKindValue extends SurfaceLaneKind = SurfaceLaneKind,
> = {
  readonly plugin: SurfacePlugin;
  readonly kind: TKindValue;
  readonly run: (
    input: PluginInputForKind<TCatalog, TKindValue>,
    context: SurfaceContextSchema,
  ) => Promise<PluginOutputForKind<TCatalog, TKindValue>>;
};

export const buildPluginCatalog = <
  TCatalog extends readonly SurfacePluginContract[],
>(
  plugins: TCatalog,
): MergePluginCatalog<TCatalog> => {
  const result = plugins.reduce(
    (acc, plugin) => ({ ...acc, [plugin.id]: plugin.kind }),
    {} as MergePluginCatalog<TCatalog>,
  );
  return result;
};

export const normalizePluginSignal = <T extends string>(value: T): `surface-plugin:${T}` =>
  `surface-plugin:${value}`;

export const sortByPriority = (events: readonly SurfacePluginEvent[]): readonly SurfacePluginEvent[] =>
  [...events].sort((left, right) => left.createdAt - right.createdAt);

export const toPluginEvents = (
  snapshot: SurfacePluginWorkspaceState,
  now: number,
): readonly SurfacePluginEvent[] => {
  const values = Array.from(Array(snapshot.pluginCount), (_, index) => index);
  return values.map((index) => ({
    eventId: `${snapshot.workspaceId}:${index}:state`,
    pluginId: `${snapshot.workspaceId}:plugin:${index}` as SurfacePluginId,
    kind: 'synthesize',
    payload: {
      workspaceId: snapshot.workspaceId,
      elapsedMs: now - snapshot.signalsPerMinute,
      pluginSlot: index,
    },
    createdAt: now,
  }));
};

export const mergeContextPayloads = <
  TSeed extends readonly [SurfacePluginId, ...SurfacePluginId[]],
  TTarget,
>(
  seed: TSeed,
  context: NoInfer<SurfaceRuntimeContext>,
  payload: TTarget,
): ReadonlyArray<{
  readonly pluginId: TSeed[number];
  readonly payload: string;
}> => seed.map((pluginId) => ({
  pluginId,
  payload: `${context.stage}:${JSON.stringify(payload)}:${pluginId}`,
}));
