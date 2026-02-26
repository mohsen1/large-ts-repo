import type { NoInfer } from './patterns';
import type { RouteCatalogEntries } from './stress-template-control-plane';

export type StageToken = `stage-${number}`;
export type StageState = 'ready' | 'armed' | 'firing' | 'complete' | 'failed';
export type StageMode = 'online' | 'offline' | 'shadow';

export interface StagePayload<TState extends StageState = StageState> {
  readonly token: StageToken;
  readonly state: TState;
  readonly weight: number;
  readonly route: RouteCatalogEntries;
}

export interface StageResult<TState extends StageState = StageState, TOutput = unknown> {
  readonly token: StageToken;
  readonly input: StagePayload<TState>;
  readonly output: TOutput;
  readonly state: TState;
}

export type StageConstraint<
  TInput,
  TOutput,
  TConfig extends Record<string, unknown>,
  TMode extends StageMode,
> = TConfig & {
  readonly mode: TMode;
  readonly signature: TInput extends StagePayload
    ? `${TInput['state']}-${TMode}`
    : `dynamic-${string}`;
};

export type StageResolver<
  TInput extends StagePayload,
  TOutput,
  TConfig extends Record<string, unknown>,
> = TInput['state'] extends 'ready'
  ? StageResult<'ready', TOutput> & TConfig
  : TInput['state'] extends 'armed'
    ? StageResult<'armed', TOutput> & TConfig
    : TInput['state'] extends 'firing'
      ? StageResult<'firing', TOutput> & TConfig
      : StageResult<'failed', TOutput> & TConfig;

export type StageFactory<TInput extends StagePayload, TOutput, TConfig extends Record<string, unknown>, TMode extends StageMode> = (
  input: TInput,
  config: StageConstraint<TInput, TOutput, TConfig, TMode>,
) => StageResolver<TInput, TOutput, TConfig>;

export interface StageDispatch {
  (input: StagePayload<'ready'>, output: string, config: StageConstraint<StagePayload<'ready'>, string, { readonly ready: true }, 'online'>): StageResolver<
    StagePayload<'ready'>,
    string,
    { readonly ready: true }
  >;
  (input: StagePayload<'armed'>, output: number, config: StageConstraint<StagePayload<'armed'>, number, { readonly armed: true }, 'online' | 'shadow'>): StageResolver<
    StagePayload<'armed'>,
    number,
    { readonly armed: true }
  >;
  <TMode extends 'offline', TOutput>(
    input: StagePayload<'firing'>,
    output: TOutput,
    config: StageConstraint<StagePayload<'firing'>, TOutput, { readonly phase: 'offline' }, TMode>,
  ): StageResolver<StagePayload<'firing'>, TOutput, { readonly phase: 'offline' }>;
  <TMode extends 'online' | 'offline' | 'shadow', TInput extends StagePayload, TOutput, TContext extends Record<string, unknown>>(
    input: NoInfer<TInput>,
    output: TOutput,
    config: StageConstraint<TInput, TOutput, TContext, TMode>,
    context: NoInfer<TContext>,
  ): StageResolver<TInput, TOutput, TContext>;
  <TMode extends 'online' | 'offline' | 'shadow', TInput extends StagePayload, TOutput, TContext extends Record<string, unknown>>(
    input: TInput,
    output: TOutput,
    config: StageConstraint<TInput, TOutput, TContext, TMode>,
    context: NoInfer<TContext>,
    ...trail: readonly [`trace-${TInput['token']}`, ...TContext[keyof TContext & string][]]
  ): StageResolver<TInput, TOutput, TContext>;
}

export const stageDispatch: StageDispatch = (((
  input: StagePayload,
  output: unknown,
  config: Record<string, unknown>,
  context?: Record<string, unknown>,
): StageResult => {
  const route = `${input.route}` as StageToken;
  return {
    token: route,
    input,
    output,
    state: input.state,
  };
}) as StageDispatch);

export const buildStagePayload = <TState extends StageState>(token: StageToken, state: TState, route: RouteCatalogEntries): StagePayload<TState> => ({
  token,
  state,
  weight: state.length + route.length,
  route,
});

export type StageFlow<T extends readonly StagePayload[]> = {
  readonly map: {
    [K in keyof T]: T[K] extends StagePayload<infer TState>
      ? StageResolver<T[K] & StagePayload<TState>, { readonly state: TState }, { readonly index: K }>
      : never;
  };
  readonly size: T['length'];
  readonly complete: T extends readonly [infer _First, ...infer Rest]
    ? Rest extends readonly StagePayload[]
      ? Rest['length']
      : 0
    : 0;
};

export const runStageChain = <T extends readonly StagePayload[]>(payloads: T): StageFlow<T> => {
  const map: unknown[] = [];

  for (let i = 0; i < payloads.length; i += 1) {
    const payload = payloads[i] as StagePayload;
    const result = (stageDispatch as (
      input: StagePayload,
      output: unknown,
      config: Record<string, unknown>,
      context: Record<string, unknown>,
    ) => StageResult) (
      payload,
      {
        state: payload.state,
        processed: i,
      },
      {
        kind: `trace-${payload.token}`,
        constraints: {
          index: i,
        },
        direction: 'center',
        timeoutMs: payload.weight * 11,
      mode: payload.state === 'firing' ? 'offline' : payload.state === 'armed' ? 'shadow' : 'online',
      signature: `${payload.state}-${payload.state === 'armed' ? 'shadow' : 'online'}`,
    },
    { route: payload.route } as Record<string, unknown>,
    );
    map[i] = result;
  }

  return {
    map,
    size: payloads.length,
    complete: Math.max(0, payloads.length - 1) as StageFlow<T>['complete'],
  } as StageFlow<T>;
};

export const stageCatalog = [
  buildStagePayload('stage-1', 'ready', '/incident/discover/critical/tenant-alpha' as RouteCatalogEntries),
  buildStagePayload('stage-2', 'armed', '/fabric/assess/high/tenant-beta' as RouteCatalogEntries),
  buildStagePayload('stage-3', 'firing', '/runtime/notify/low/tenant-gamma' as RouteCatalogEntries),
  buildStagePayload('stage-4', 'complete', '/policy/rollback/critical/tenant-delta' as RouteCatalogEntries),
  buildStagePayload('stage-5', 'failed', '/telemetry/mitigate/high/tenant-epsilon' as RouteCatalogEntries),
] as const satisfies readonly StagePayload[];

export const stageResultCatalog = runStageChain(stageCatalog);

export type StageAccumulator<T extends number, V = StagePayload> = {
  readonly capacity: T;
  readonly backlog: readonly V[];
  readonly active: T extends 0 ? false : true;
};

export type StageAccumulatorFold<T extends readonly StagePayload[]> = {
  [K in keyof T]: T[K] extends StagePayload ? StageAccumulator<K & number, T[K]> : never;
};

export const stageAccumulator = <T extends readonly StagePayload[]>(payloads: T): StageAccumulatorFold<T> => {
  const accumulator: unknown[] = [];
  for (const payload of payloads) {
    accumulator.push({
      capacity: payload.weight % 12,
      backlog: [payload],
      active: payload.weight > 0,
    });
  }
  return accumulator as StageAccumulatorFold<T>;
};

export const stageSignature = <T extends StagePayload>(payload: T): `${T['state']}-${T['token']}` =>
  `${payload.state}-${payload.token}`;

export const stageMatrix = <T extends StagePayload[]>(
  payloads: T,
  mapper: (payload: T[number]) => string = stageSignature,
): ReadonlyMap<string, T[number]> => {
  const map = new Map<string, T[number]>();
  for (const payload of payloads) {
    map.set(mapper(payload), payload);
  }
  return map;
};
