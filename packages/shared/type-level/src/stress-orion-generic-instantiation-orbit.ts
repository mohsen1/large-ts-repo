import type { NoInfer } from './patterns';

export type OrbitDomain = 'incident' | 'fabric' | 'workflow' | 'policy' | 'mesh';
export type OrbitVerb = 'open' | 'close' | 'observe' | 'resolve' | 'repair' | 'verify' | 'simulate';
export type OrbitState = 'idle' | 'loading' | 'ready' | 'active' | 'blocked' | 'archived';

export interface OrbitConstraint<
  TDomain extends string = string,
  TVerb extends string = string,
  TPayload extends Record<string, unknown> = Record<string, unknown>,
  TState extends string = string,
> {
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly payload: TPayload;
  readonly state: TState;
}

export type OrbitEnvelope<TConstraint extends OrbitConstraint<string, string>> = {
  readonly domain: TConstraint['domain'];
  readonly verb: TConstraint['verb'];
  readonly token: `${TConstraint['domain']}:${TConstraint['verb']}`;
  readonly keys: (keyof TConstraint['payload'])[];
  readonly state: TConstraint['state'];
};

export type OrbitChain<TConstraint extends OrbitConstraint<string, string> = OrbitConstraint> = {
  readonly entry: TConstraint;
  readonly envelope: OrbitEnvelope<TConstraint>;
};

export type ConstrainedSolver<
  TDomain extends string,
  TVerb extends string,
  TPayload extends Record<string, unknown>,
  TOutput,
> = (input: TPayload) => Promise<{
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly payload: TPayload;
  readonly output: TOutput;
  readonly state: 'completed';
}>;

export interface OrbitAdapter<
  TConstraint extends OrbitConstraint<string, string>,
  TResult,
  TError extends Error = never,
> {
  readonly input: {
    readonly domain: TConstraint['domain'];
    readonly verb: TConstraint['verb'];
    readonly payload: TConstraint['payload'];
    readonly state: TConstraint['state'];
  };
  readonly execute: ConstrainedSolver<
    TConstraint['domain'],
    TConstraint['verb'],
    TConstraint['payload'],
    TResult
  >;
  readonly signature: OrbitEnvelope<TConstraint>;
  readonly errorState: TError | null;
  readonly metadata: {
    readonly id: string;
    readonly locked: boolean;
  };
}

export type OrbitAdapterFactory = <TConstraint extends OrbitConstraint<string, string>, TResult>(
  signature: OrbitEnvelope<TConstraint>,
  execute: ConstrainedSolver<TConstraint['domain'], TConstraint['verb'], TConstraint['payload'], TResult>,
) => OrbitAdapter<TConstraint, TResult>;

const buildAdapter = <
  TConstraint extends OrbitConstraint<string, string>,
  TResult,
>(
  signature: OrbitEnvelope<TConstraint>,
  execute: ConstrainedSolver<TConstraint['domain'], TConstraint['verb'], TConstraint['payload'], TResult>,
): OrbitAdapter<TConstraint, TResult> => ({
  input: {
    domain: signature.domain,
    verb: signature.verb,
    payload: {} as TConstraint['payload'],
    state: 'ready' as TConstraint['state'],
  },
  execute,
  signature,
  errorState: null as never,
  metadata: {
    id: signature.token,
    locked: false,
  },
});

export const createAdapter: OrbitAdapterFactory = (signature, execute) => buildAdapter(signature, execute);

export type ResolveOrbitConstraint<T extends OrbitConstraint<string, string>> =
  T extends OrbitConstraint<infer D, infer V, infer P, infer S>
    ? OrbitEnvelope<OrbitConstraint<D, V, P, S>>
    : never;

export type OrbitDispatchMatrix<T extends readonly OrbitConstraint<string, string>[]> = {
  readonly envelopes: { [K in keyof T]: ResolveOrbitConstraint<T[K]> };
  readonly keys: { [K in keyof T]: T[K]['domain'] };
};

export type OrbitResultUnion<TAdapters extends readonly OrbitAdapter<any, any>[]> =
  TAdapters[number] extends OrbitAdapter<infer C, infer R>
    ? {
        readonly domain: C['domain'];
        readonly verb: C['verb'];
        readonly payload: C['payload'];
        readonly output: R;
      }
    : never;

export const makeConstraint = <
  TDomain extends string,
  TVerb extends string,
  TPayload extends Record<string, unknown>,
>(
  domain: TDomain,
  verb: TVerb,
  payload: TPayload,
): OrbitConstraint<TDomain, TVerb, TPayload> => ({
  domain,
  verb,
  payload,
  state: 'idle',
});

export const toEnvelope = <T extends OrbitConstraint<string, string>>(constraint: T): OrbitEnvelope<T> => ({
  domain: constraint.domain,
  verb: constraint.verb,
  token: `${constraint.domain}:${constraint.verb}`,
  state: constraint.state,
  keys: Object.keys(constraint.payload) as Extract<keyof T['payload'], string>[],
});

export const instantiateOrbitAdapters = <
  T extends readonly OrbitConstraint<string, string>[],
  TResult,
>(
  constraints: T,
  execute: <C extends OrbitConstraint<string, string>>(
    constraint: C,
  ) => Promise<{
    readonly domain: C['domain'];
    readonly verb: C['verb'];
    readonly payload: C['payload'];
    readonly output: TResult;
    readonly state: 'completed';
  }>,
): OrbitDispatchMatrix<T> => {
  const envelopes = constraints.map((constraint) => toEnvelope(constraint)) as {
    [K in keyof T]: ResolveOrbitConstraint<T[K]>;
  };
  const keys = constraints.map((constraint) => constraint.domain) as {
    [K in keyof T]: T[K]['domain'];
  };
  void (constraints[0] ? execute(constraints[0] as OrbitConstraint) : Promise.resolve(undefined as never));
  return { envelopes, keys };
};

export const attachAdapters = <
  TPayloads extends readonly OrbitConstraint<string, string>[],
  TOutput,
>(
  constraints: TPayloads,
  factory: OrbitAdapterFactory,
): readonly OrbitAdapter<TPayloads[number], TOutput>[] => {
  const adapters: OrbitAdapter<TPayloads[number], TOutput>[] = [];

  for (const constraint of constraints) {
    const signature = toEnvelope(constraint);
    const adapter = factory(signature, async (payload) => ({
      domain: constraint.domain as OrbitConstraint<string, string>['domain'],
      verb: constraint.verb as OrbitConstraint<string, string>['verb'],
      payload,
      output: Object.freeze({}) as TOutput,
      state: 'completed',
    }));
    adapters.push(adapter);
  }

  return adapters;
};

export function dispatchWithConstraintIntersects<
  TDomainA extends OrbitDomain,
  TDomainB extends OrbitDomain,
  TVerb extends OrbitVerb,
  TPayload extends Record<string, unknown>,
>(
  domainA: TDomainA,
  domainB: TDomainB,
  verb: NoInfer<TVerb>,
  payload: NoInfer<TPayload>,
): OrbitConstraint<TDomainA | TDomainB, TVerb, TPayload> {
  return {
    domain: domainA,
    verb,
    payload,
    state: 'active',
  };
}

export const runOrbitGraph = async <TAdapters extends readonly OrbitAdapter<OrbitConstraint<string, string>, unknown>[]>(
  adapters: TAdapters,
): Promise<{
  readonly outcomes: OrbitResultUnion<TAdapters>[];
  readonly count: number;
}> => {
  const outcomes: OrbitResultUnion<TAdapters>[] = [];
  for (const adapter of adapters) {
    const sample = await adapter.execute(adapter.input);
    const resolved = {
      domain: sample.domain,
      verb: sample.verb,
      payload: sample.payload,
      output: sample.output,
    } as OrbitResultUnion<TAdapters>;
    outcomes.push(resolved);
  }

  return {
    outcomes,
    count: outcomes.length,
  };
};

export const OrbitFactory = {
  create<T extends OrbitConstraint<string, string>>(constraint: T): OrbitAdapter<T, string> {
    const signature = toEnvelope(constraint);
    return createAdapter<T, string>(signature, async (payload) => ({
      domain: constraint.domain,
      verb: constraint.verb,
      payload,
      output: `${signature.token}:${signature.keys.length}`,
      state: 'completed',
    })) as OrbitAdapter<T, string>;
  },
  batch<T extends readonly OrbitConstraint<string, string>[]>(constraints: T) {
    return constraints.map((constraint) => OrbitFactory.create(constraint));
  },
} as const;

export type OrbitPayloadUnion<TConstraints extends readonly OrbitConstraint<string, string>[]> = {
  [K in keyof TConstraints]: ResolveOrbitConstraint<TConstraints[K]>;
};

export type BuildOrbitFactory<T extends number> = T extends 0
  ? ReadonlyArray<OrbitAdapter<OrbitConstraint<string, string>, string>>
  : BuildOrbitFactory<Decrement<T>>;

export type Decrement<T extends number> = [
  never,
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
  10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
  30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
  40,
][T];

export const buildOrbitWorkload = (count: 6): ReadonlyArray<OrbitConstraint<string, string>> => {
  const domains: OrbitDomain[] = ['incident', 'fabric', 'workflow', 'policy', 'mesh', 'incident'];
  const verbs: OrbitVerb[] = ['open', 'observe', 'resolve', 'repair', 'simulate', 'verify', 'close'];
  const workload: OrbitConstraint<string, string>[] = [];
  let cursor = 0;

  while (cursor < count) {
    const domain = domains[cursor % domains.length] ?? 'incident';
    const verb = verbs[cursor % verbs.length] ?? 'open';
    workload.push(makeConstraint(domain, verb, {
      weight: cursor + 1,
      tag: `workload-${cursor}`,
    }));
    cursor += 1;
  }

  return workload;
};
