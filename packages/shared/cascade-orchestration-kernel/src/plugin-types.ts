import type { Brand } from '@shared/core';
import type { NoInfer } from '@shared/type-level';

export type CapabilityTag<T extends string = string> = `capability:${T}`;
export type PluginId<T extends string = string> = Brand<string, `PluginId:${T}`>;

export type PluginStage = 'input' | 'transform' | 'validate' | 'execute' | 'observe';

export interface PluginCapabilities<T extends readonly CapabilityTag[]> {
  readonly capabilities: T;
}

export interface PluginPayloadEnvelope<TScope extends string, TInput, TOutput> {
  readonly pluginId: PluginId<TScope>;
  readonly scope: TScope;
  readonly input: TInput;
  readonly metadata?: Record<string, unknown>;
  readonly output?: TOutput;
}

export interface PluginRuntimeContext<TInput = unknown, TOutput = unknown, TState = unknown> {
  readonly runId: Brand<string, 'RunId'>;
  readonly startedAt: string;
  readonly state: TState;
  readonly input: TInput;
  readonly emit: <TEvent extends PluginEvent>(event: TEvent) => void;
}

export interface PluginResultEnvelope<TScope extends string, TOutput> {
  readonly pluginId: PluginId<TScope>;
  readonly scope: TScope;
  readonly output: TOutput;
  readonly latencyMs: number;
}

export interface PluginDefinition<
  TId extends PluginId<string> = PluginId<string>,
  TScope extends string = string,
  TInput = unknown,
  TOutput = unknown,
  TCapabilities extends readonly CapabilityTag[] = readonly CapabilityTag[],
  TState = unknown,
> {
  readonly id: TId;
  readonly name: string;
  readonly stage: PluginStage;
  readonly scope: TScope;
  readonly capabilities: TCapabilities;
  run(context: PluginRuntimeContext<TInput, TOutput, TState>): Promise<PluginResultEnvelope<TScope, TOutput>> | PluginResultEnvelope<TScope, TOutput>;
}

export type PluginOf<
  TId extends PluginId<string>,
  TScope extends string,
  TInput,
  TOutput,
  TCapabilities extends readonly CapabilityTag[],
  TState,
> = PluginDefinition<TId, TScope, TInput, TOutput, TCapabilities, TState>;

export type PluginIdFor<T extends PluginDefinition> = T['id'];
export type PluginNameMap<T extends readonly PluginDefinition[]> = {
  [K in T[number] as K['id']]: K;
};

export type PluginResultType<TPlugin extends PluginDefinition> =
  TPlugin extends PluginDefinition<any, any, any, infer TOutput, any, any>
    ? TOutput
    : never;

export type PluginInputType<TPlugin extends PluginDefinition> =
  TPlugin extends PluginDefinition<any, any, infer TInput, any, any, any>
    ? TInput
    : never;

export type PluginCapabilitiesFor<TPlugin extends PluginDefinition> = TPlugin['capabilities'];

export type PluginHasCapability<
  TPlugin extends PluginDefinition,
  TNeed extends CapabilityTag,
> = PluginCapabilitiesFor<TPlugin> extends readonly (infer C)[]
  ? C extends TNeed ? true : never
  : never;

export type PluginEvent =
  | {
      readonly kind: 'plugin.start';
      readonly timestamp: string;
    }
  | {
      readonly kind: 'plugin.progress';
      readonly percentage: number;
      readonly timestamp: string;
    }
  | {
      readonly kind: 'plugin.error';
      readonly message: string;
      readonly timestamp: string;
    }
  | {
      readonly kind: 'plugin.complete';
      readonly timestamp: string;
      readonly metrics: Record<string, number>;
    };

export type InferPluginOutput<T> = T extends PluginDefinition<
  infer _Id,
  infer _Scope,
  infer _In,
  infer Out,
  infer _Cap,
  infer _State
>
  ? Out
  : never;

export const pluginDefinition = <
  const T extends readonly CapabilityTag[],
  const Id extends PluginId<string>,
  const Scope extends string,
  const In,
  const Out,
  const State,
>(spec: {
  readonly id: Id;
  readonly name: string;
  readonly scope: Scope;
  readonly stage: PluginStage;
  readonly capabilities: T;
  readonly run: (context: PluginRuntimeContext<In, Out, State>) => Promise<PluginResultEnvelope<Scope, Out>> | PluginResultEnvelope<Scope, Out>;
}): PluginDefinition<NoInfer<Id>, NoInfer<Scope>, In, Out, T, State> => spec;

export type MergeContext<TLeft, TRight> =
  TLeft & TRight extends infer M ? M : never;
