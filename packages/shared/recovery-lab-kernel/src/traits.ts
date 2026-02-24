import { withBrand, type Brand } from '@shared/core';

export type PluginKind = 'ingest' | 'transform' | 'synthesize' | 'verify' | 'observe';
export type PluginKindState = Record<PluginKind, number>;

export type PluginStatus = 'idle' | 'arming' | 'running' | 'stopped' | 'failed';
export type StageTickStatus = 'queued' | 'ready' | 'active' | 'complete' | 'aborted';

export type TraceId = Brand<string, 'TraceId'>;
export type RunPath<T extends string = string> = `${T}:path:${string}`;

export type StagePayload<T> = {
  readonly id: string;
  readonly name: T;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly status: StageTickStatus;
};

export interface PluginEnvelope<TInput, TOutput, TKind extends PluginKind> {
  readonly pluginId: string;
  readonly kind: TKind;
  readonly stage: number;
  readonly version: `${number}.${number}.${number}`;
  readonly inputShape: TInput;
  readonly outputShape: TOutput;
  readonly active: boolean;
}

export interface PluginDefinition<TInput, TOutput, TKind extends PluginKind> {
  readonly id: string;
  readonly kind: TKind;
  readonly stage: number;
  readonly schema: {
    parse(value: unknown): TInput;
  };
  readonly run: (input: TInput, context: PluginContext) => Promise<TOutput> | TOutput;
}

export interface PluginContext {
  readonly tenant: string;
  readonly traceId: TraceId;
  readonly correlationKey: string;
  readonly startedAt: number;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PluginResult<TOutput> {
  readonly ok: boolean;
  readonly output?: TOutput;
  readonly message?: string;
}

export const asTraceId = (value: string): TraceId => withBrand(value.trim() || 'trace', 'TraceId');

export type PluginContract<TInput, TOutput, TKind extends PluginKind, TConfig = unknown> = {
  readonly id: string;
  readonly kind: TKind;
  readonly config: TConfig;
  readonly manifest: PluginDefinition<TInput, TOutput, TKind>;
};

export type PluginContractByKind<TKind extends PluginKind> =
  TKind extends 'ingest'
    ? PluginContract<unknown, unknown, 'ingest', unknown>
    : TKind extends 'transform'
      ? PluginContract<unknown, unknown, 'transform', unknown>
      : TKind extends 'synthesize'
        ? PluginContract<unknown, unknown, 'synthesize', unknown>
        : TKind extends 'verify'
          ? PluginContract<unknown, unknown, 'verify', unknown>
          : TKind extends 'observe'
            ? PluginContract<unknown, unknown, 'observe', unknown>
            : never;

export type PluginInputOf<TPlugin> = TPlugin extends PluginContract<infer TInput, any, any, any>
  ? TInput
  : never;

export type PluginOutputOf<TPlugin> = TPlugin extends PluginContract<any, infer TOutput, any, any>
  ? TOutput
  : never;

export type PluginConfigFor<TPlugin> = TPlugin extends PluginContract<any, any, any, infer TConfig>
  ? TConfig
  : never;

export const pluginPhaseRanks: Record<PluginKind, number> = {
  ingest: 0,
  transform: 1,
  synthesize: 2,
  verify: 3,
  observe: 4,
} as const satisfies PluginKindState;
