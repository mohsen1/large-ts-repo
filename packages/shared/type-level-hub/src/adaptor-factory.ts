import type { NoInfer, Brand } from '@shared/type-level';
import { fail, ok, isOk, type Result } from '@shared/result';

export type FactoryId = Brand<string, 'FactoryId'>;
export type AdapterId = Brand<string, 'AdapterId'>;
export type AdapterSignal<T extends string> = Brand<T, 'AdapterSignal'>;

export type RuntimePayload<T extends string> = {
  readonly verb: AdapterSignal<T>;
  readonly input: Record<string, unknown>;
};

export type RuntimeResult<T extends string, O> = {
  readonly signal: AdapterSignal<T>;
  readonly payload: O;
  readonly metadata: Readonly<Record<string, string>>;
};

export type AdapterInvocation<TSignature extends string, TInput, TOutput> = (
  input: NoInfer<TInput>,
  context?: { readonly signal: AdapterSignal<TSignature>; readonly requestId?: FactoryId },
) => Promise<Result<TOutput, Error>>;

export interface HubAdapter<TSignature extends string, TInput, TOutput> {
  readonly id: AdapterId;
  readonly signature: TSignature;
  readonly invoke: AdapterInvocation<TSignature, TInput, TOutput>;
}

export type PluginBundle<TSignature extends string, TInput, TOutput> = {
  readonly id: FactoryId;
  readonly adapters: readonly HubAdapter<TSignature, TInput, TOutput>[];
};

const toFactoryId = (value: string): FactoryId => value as FactoryId;
const toAdapterId = (value: string): AdapterId => value as AdapterId;
const toSignal = <const T extends string>(value: T): AdapterSignal<T> => value as AdapterSignal<T>;

export const createHubAdapter = <const TSignature extends string, TInput, TOutput>(
  id: string,
  signature: TSignature,
  handle: (payload: RuntimePayload<TSignature>) => Promise<TOutput>,
): HubAdapter<TSignature, RuntimePayload<TSignature>, TOutput> => ({
  id: toAdapterId(id),
  signature,
  invoke: async (input, context) => {
    try {
      const payload = {
        verb: toSignal(signature),
        input,
      };
      const output = await handle(payload);
      return ok(output);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error(String(error)), 'ADAPTER-ERROR');
    }
  },
});

export const buildPluginBundle = <const TSignature extends string, const TInput, const TOutput>(
  namespace: string,
  adapters: Array<HubAdapter<TSignature, TInput, TOutput>>,
): PluginBundle<TSignature, TInput, TOutput> => ({
  id: toFactoryId(namespace),
  adapters: adapters as readonly HubAdapter<TSignature, TInput, TOutput>[],
});

export const createPluginBundle = buildPluginBundle;

export const runAdapterBySignal = async <const TSignature extends string, TInput, TOutput>(
  bundle: PluginBundle<TSignature, TInput, TOutput>,
  signal: AdapterSignal<TSignature>,
  payload: NoInfer<TInput>,
): Promise<Result<TOutput, Error>> => {
  const adapter = bundle.adapters.find((entry) => entry.signature === (signal as string));
  if (!adapter) {
    return fail(new Error(`missing adapter for ${signal as string}`), 'ADAPTER-MISS');
  }
  return adapter.invoke(payload, { signal });
};

export type HigherOrderAdapter<TSignature extends string, TInput, TOutput> = (
  next: AdapterInvocation<TSignature, TInput, TOutput>,
) => AdapterInvocation<TSignature, TInput, TOutput>;

export const withResultGuard = <TSignature extends string, TInput, TOutput>(
  fn: AdapterInvocation<TSignature, TInput, TOutput>,
): AdapterInvocation<TSignature, TInput, TOutput> => {
  return async (input, context) => {
    const resultValue = await fn(input, context);
    if (!isOk(resultValue)) {
      return fail(new Error(`${context?.signal ?? 'unknown'} failed`), 'GUARD-FAIL');
    }
    return ok(resultValue.value);
  };
};

export const chainAdapters = <TSignature extends string, TInput, TOutput>(
  first: AdapterInvocation<TSignature, TInput, TOutput>,
  ...rest: Array<HigherOrderAdapter<TSignature, TInput, TOutput>>
): AdapterInvocation<TSignature, TInput, TOutput> => {
  return rest.reduce<AdapterInvocation<TSignature, TInput, TOutput>>(
    (acc, middleware) => middleware(acc),
    first,
  );
};
