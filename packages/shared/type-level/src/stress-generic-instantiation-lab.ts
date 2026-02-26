import type { NoInfer } from './patterns';
import type { NoInferAdvanced } from './composition-labs';

export type WorkDomain =
  | 'agent'
  | 'artifact'
  | 'auth'
  | 'catalog'
  | 'cluster'
  | 'control'
  | 'delivery'
  | 'dispatcher'
  | 'edge'
  | 'fleet'
  | 'forensics'
  | 'gateway'
  | 'identity'
  | 'incident'
  | 'integration'
  | 'inventory'
  | 'ledger'
  | 'loader'
  | 'mesh'
  | 'observer'
  | 'orchestrator'
  | 'policy'
  | 'planner'
  | 'telemetry'
  | 'runtime'
  | 'signal'
  | 'registry'
  | 'runtime-plane';

export type WorkVerb =
  | 'activate'
  | 'align'
  | 'audit'
  | 'bootstrap'
  | 'capture'
  | 'classify'
  | 'commit'
  | 'deploy'
  | 'dispatch'
  | 'drain'
  | 'evaluate'
  | 'gather'
  | 'ingest'
  | 'inspect'
  | 'isolate'
  | 'load'
  | 'observe'
  | 'orchestrate'
  | 'propagate'
  | 'quarantine'
  | 'reconcile'
  | 'restore'
  | 'route'
  | 'scale'
  | 'secure'
  | 'simulate'
  | 'snapshot'
  | 'stabilize'
  | 'triage'
  | 'verify';

export type WorkMode = 'hot' | 'warm' | 'cold' | 'maintenance' | 'emergency' | 'degraded';
export type WorkStatus = 'warn' | 'ok' | 'critical';
export type WorkTag = `w-${WorkDomain}/${WorkVerb}/${WorkMode}`;

export type BuildTuple<
  TSize extends number,
  TAcc extends readonly unknown[] = [],
> = TAcc['length'] extends TSize ? TAcc : BuildTuple<TSize, [...TAcc, unknown]>;
type Decrement<T extends number> = T extends 0 ? 0 : BuildTuple<T> extends readonly [infer _First, ...infer Rest] ? Rest['length'] : T;

export type Repeat<T, N extends number, TAcc extends readonly T[] = []> = N extends 0 ? TAcc : Repeat<T, Decrement<N>, [...TAcc, T]>;
export type VariadicPath<T extends string, N extends number> = N extends 0 ? T : `${T}/${N}` | VariadicPath<T, Decrement<N>>;

export type WorkPayload<
  TDomain extends WorkDomain = WorkDomain,
  TVerb extends WorkVerb = WorkVerb,
  TMode extends WorkMode = WorkMode,
> = {
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly mode: TMode;
  readonly weight: number;
  readonly label: string;
  readonly context: {
    readonly mode: TMode;
    readonly active: boolean;
    readonly marker: `/agent/${TVerb}/${TMode}/${TDomain}`;
  };
};

export type WorkOutput<
  TDomain extends WorkDomain = WorkDomain,
  TVerb extends WorkVerb = WorkVerb,
  TMode extends WorkMode = WorkMode,
> = {
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly mode: TMode;
  readonly status: WorkStatus;
  readonly score: number;
  readonly channel: WorkTag;
  readonly input: WorkPayload<TDomain, TVerb, TMode>;
};

export type StageForMode<TMode extends WorkMode> = TMode extends 'emergency' | 'hot'
  ? 'priority'
  : TMode extends 'warm' | 'maintenance'
    ? 'replay'
    : 'steady';

export type WorkSignature<TDomain extends WorkDomain, TVerb extends WorkVerb, TMode extends WorkMode> = `${TDomain}:${TVerb}:${TMode}`;

type ConstraintFlags<TDomain extends WorkDomain, TVerb extends WorkVerb> = {
  readonly allow: [TVerb];
  readonly guard: TDomain extends 'security' ? 'strict' : 'normal';
};

export type WorkFactorySeed<
  TDomain extends WorkDomain = WorkDomain,
  TVerb extends WorkVerb = WorkVerb,
  TMode extends WorkMode = WorkMode,
> = {
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly mode: TMode;
  readonly input?: WorkPayload<TDomain, TVerb, TMode>;
  readonly output?: WorkOutput<TDomain, TVerb, TMode>;
  readonly status?: WorkStatus;
  readonly score?: number;
  readonly channel?: string;
};

export interface WorkFactoryItem<
  TDomain extends WorkDomain = WorkDomain,
  TVerb extends WorkVerb = WorkVerb,
  TMode extends WorkMode = WorkMode,
  TInput extends WorkPayload<TDomain, TVerb, TMode> = WorkPayload<TDomain, TVerb, TMode>,
  TOutput extends WorkOutput<TDomain, TVerb, TMode> = WorkOutput<TDomain, TVerb, TMode>,
> {
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly mode: TMode;
  readonly signature: WorkSignature<TDomain, TVerb, TMode>;
  readonly stage: StageForMode<TMode>;
  readonly constraints: ConstraintFlags<TDomain, TVerb>;
  readonly input: TInput;
  readonly output: TOutput;
  readonly metadata: {
    readonly tag: WorkTag;
    readonly priority: TMode extends 'emergency' | 'hot' ? 0 : 1;
    readonly vector: Repeat<TMode, 3>;
    readonly path: VariadicPath<TDomain, 2>;
  };
}

export type BuildWorkFactory<T extends WorkFactorySeed> = T extends {
  readonly domain: infer D extends WorkDomain;
  readonly verb: infer V extends WorkVerb;
  readonly mode: infer M extends WorkMode;
}
  ? WorkFactoryItem<
      D,
      V,
      M,
      T['input'] extends WorkPayload<D, V, M> ? T['input'] : WorkPayload<D, V, M>,
      T['output'] extends WorkOutput<D, V, M> ? T['output'] : WorkOutput<D, V, M>
    >
  : never;

export type WorkFactoryMatrix<TSpecs extends readonly WorkFactoryItem[]> = {
  [K in keyof TSpecs as K extends `${number}` ? K : never]: TSpecs[K] extends WorkFactoryItem<infer D, infer V, infer M>
    ? {
        readonly key: `${D & string}:${V & string}:${M & string}`;
        readonly spec: TSpecs[K];
      }
    : never;
};

export interface WorkPipeline<TSpecs extends readonly WorkFactoryItem[]> {
  readonly specs: TSpecs;
  readonly matrix: WorkFactoryMatrix<TSpecs>;
  readonly run: (index: number, input: WorkPayload) => WorkOutput;
}

export type RunPipeline<TSpecs extends readonly WorkFactoryItem[]> = WorkPipeline<TSpecs>;

type FactoryOutput<T extends WorkFactorySeed> = BuildWorkFactory<T> | never;
type SeedTuple = readonly WorkFactorySeed[];

const defaultPayload = <TDomain extends WorkDomain, TVerb extends WorkVerb, TMode extends WorkMode>(
  domain: TDomain,
  verb: TVerb,
  mode: TMode,
): WorkPayload<TDomain, TVerb, TMode> => ({
  domain,
  verb,
  mode,
  weight: 42,
  label: `${domain}:${verb}:${mode}`,
  context: {
    mode,
    active: true,
    marker: `/agent/${verb}/${mode}/${domain}`,
  },
});

const defaultOutput = <TDomain extends WorkDomain, TVerb extends WorkVerb, TMode extends WorkMode>(
  domain: TDomain,
  verb: TVerb,
  mode: TMode,
  payload: WorkPayload<TDomain, TVerb, TMode>,
): WorkOutput<TDomain, TVerb, TMode> => ({
  domain,
  verb,
  mode,
  status: mode === 'emergency' ? 'critical' : payload.weight > 70 ? 'warn' : 'ok',
  score: payload.weight,
  channel: `w-${domain}/${verb}/${mode}`,
  input: payload,
});

const normalizeSeed = <T extends WorkFactorySeed>(seed: T): BuildWorkFactory<T> => {
  const payload = seed.input ?? defaultPayload(seed.domain, seed.verb, seed.mode);
  const output = seed.output ?? defaultOutput(seed.domain, seed.verb, seed.mode, payload);
  return {
    domain: seed.domain,
    verb: seed.verb,
    mode: seed.mode,
    signature: `${seed.domain}:${seed.verb}:${seed.mode}`,
    stage: seed.mode === 'emergency' || seed.mode === 'hot' ? 'priority' : 'steady',
    constraints: {
      allow: [seed.verb],
      guard: seed.mode === 'degraded' ? 'strict' : 'normal',
    },
    input: payload as never,
    output: output as never,
    metadata: {
      tag: `w-${seed.domain}/${seed.verb}/${seed.mode}`,
      priority: seed.mode === 'emergency' ? 0 : 1,
      vector: ['hot', 'warm', 'cold'] as Repeat<WorkMode, 3>,
      path: `${seed.domain}/entry/step` as VariadicPath<WorkDomain, 2>,
    },
  } as unknown as BuildWorkFactory<T>;
};

export function defineWorkFactories<
  TDomain extends WorkDomain,
  TVerb extends WorkVerb,
  TMode extends WorkMode,
>(
  domain: TDomain,
  verb: TVerb,
  payload: WorkPayload<TDomain, TVerb, TMode>,
  output?: WorkOutput<TDomain, TVerb, TMode>,
): WorkFactoryItem<TDomain, TVerb, TMode>;
export function defineWorkFactories(
  seed: WorkFactorySeed,
): WorkFactoryItem;
export function defineWorkFactories(
  ...seeds: readonly WorkFactorySeed[]
): WorkFactoryItem[];
export function defineWorkFactories(...args: unknown[]): WorkFactoryItem | WorkFactoryItem[] {
  const [first, second, third, fourth] = args;
  if (typeof first === 'string' && typeof second === 'string' && typeof third === 'object') {
    const payload = third as WorkPayload;
    const output = fourth as WorkOutput | undefined;
    const mode = payload.mode;
    return normalizeSeed({
      domain: first as WorkDomain,
      verb: second as WorkVerb,
      mode,
      input: payload,
      output,
    }) as WorkFactoryItem;
  }
  if (typeof first === 'object' && first !== null && typeof second === 'undefined') {
    return [normalizeSeed(first as WorkFactorySeed)];
  }
  return (args as WorkFactorySeed[]).filter(Boolean).map((seed) => normalizeSeed(seed));
}

export function buildFactoryMatrix<TSpecs extends readonly WorkFactoryItem[]>(...specs: TSpecs): WorkFactoryMatrix<TSpecs> {
  const out: Record<string, { key: string; spec: WorkFactoryItem }> = {};
  for (const spec of specs) {
    const key = `${spec.domain}:${spec.verb}:${spec.mode}`;
    out[key] = { key, spec };
  }
  return out as WorkFactoryMatrix<TSpecs>;
}

export function registerWorkloadPipeline<TSpecs extends readonly WorkFactoryItem[]>(
  ...specs: TSpecs
): {
  readonly specs: TSpecs;
  readonly matrix: WorkFactoryMatrix<TSpecs>;
} {
  return {
    specs,
    matrix: buildFactoryMatrix(...specs),
  };
}

export const createPipelineRunner = <TSpecs extends readonly WorkFactoryItem[]>(specs: TSpecs): WorkPipeline<TSpecs> => {
  return {
    specs,
    matrix: buildFactoryMatrix(...specs),
    run: (index, input) => {
      const hit = specs[index];
      if (!hit) {
        return {
          ...defaultOutput('agent', 'activate', 'hot', defaultPayload('agent', 'activate', 'hot')),
          input,
        } as WorkOutput;
      }
      return {
        ...hit.output,
        input: {
          ...input,
          context: {
            mode: hit.mode,
            active: input.context.active,
            marker: `/agent/${hit.verb}/${hit.mode}/${hit.domain}`,
          },
        } as WorkPayload,
      };
    },
  };
};

export const buildPipeline = <const TSpecs extends readonly WorkFactoryItem[]>(
  ...specs: TSpecs
) => registerWorkloadPipeline(...specs);

export const chainFactories = <TSpecs extends readonly WorkFactoryItem[]>(...specs: TSpecs) =>
  specs.reduce((acc, spec, index) => [...acc, `${index}:${spec.signature}`], [] as string[]);

export const expandWorkloadMatrix = <TSpecs extends readonly WorkFactoryItem[]>(specs: TSpecs) => {
  const catalog = buildFactoryMatrix(...specs);
  return {
    catalog,
    entries: Object.entries(catalog),
  };
};

export const describeWorkload = <
  TDomain extends WorkDomain,
  TVerb extends WorkVerb,
  TMode extends WorkMode,
>(
  domain: TDomain,
  verb: TVerb,
  mode: TMode,
) => {
  const payload = defaultPayload(domain, verb, mode);
  return normalizeSeed({
    domain,
    verb,
    mode,
    input: payload,
  });
};

export type WorkCatalogBySignature<TSpecs extends readonly WorkFactoryItem[]> = WorkFactoryMatrix<TSpecs>;

export const workloadMatrixExamples = [
  defaultPayload('agent', 'activate', 'hot'),
  defaultPayload('mesh', 'route', 'maintenance'),
  defaultPayload('control', 'triage', 'emergency'),
] as const satisfies readonly WorkPayload[];

export const resolvedFactoryExamples = workloadMatrixExamples.map((payload) => normalizeSeed({
  domain: payload.domain,
  verb: payload.verb,
  mode: payload.mode,
  input: payload,
}));

export const mappedFactoryExamples = resolvedFactoryExamples.map((factory) => ({
  [factory.signature]: {
    domain: factory.domain,
    mode: factory.mode,
    verb: factory.verb,
  },
}));

export const expandByDomain = <TSpecs extends readonly WorkFactoryItem[]>(...specs: TSpecs) => {
  const buckets: Record<WorkDomain, WorkFactoryItem[]> = {} as Record<WorkDomain, WorkFactoryItem[]>;
  for (const spec of specs) {
    const key = spec.domain;
    (buckets[key] ||= []).push(spec);
  }
  return buckets;
};

const toDomain = (value: string): WorkDomain => value as WorkDomain;
const toVerb = (value: string): WorkVerb => value as WorkVerb;
const toMode = (value: string): WorkMode => (value as WorkMode);

export const resolveFactoryMode = (value: string): WorkMode => {
  const mode = toMode(value);
  return mode === 'hot' || mode === 'warm' || mode === 'cold' || mode === 'maintenance' || mode === 'emergency' || mode === 'degraded'
    ? mode
    : 'warm';
};

export const buildWorkloadCatalog = (...specs: readonly WorkFactoryItem[]) => ({
  specs,
  signatures: specs.map((item) => item.signature),
  matrix: buildFactoryMatrix(...specs),
});

export const runPipeline = <TSpecs extends readonly WorkFactoryItem[]>(
  specs: TSpecs,
): WorkOutput => {
  const runner = createPipelineRunner(specs);
  const first = specs[0];
  return runner.run(0, {
    ...defaultPayload('agent', 'activate', 'hot'),
    domain: first?.domain ?? 'agent',
    verb: first?.verb ?? 'activate',
    mode: first?.mode ?? 'warm',
  } as WorkPayload) as WorkOutput;
};

export const pipelineRunner = <TSpecs extends readonly WorkFactoryItem[]>(specs: TSpecs) => createPipelineRunner(specs);

export function registerWorkloadPipelineFactories<
  TSpecs extends readonly WorkFactoryItem[],
>(...specs: TSpecs) {
  const catalog = buildWorkloadCatalog(...specs);
  return {
    ...catalog,
    domainCount: Object.keys(expandByDomain(...specs)).length,
    routeHint: specs.map((spec) => `/agent/${spec.verb}/${spec.mode}/${spec.domain}`).join('|'),
    guardHints: specs.map((spec) => `${toDomain(spec.domain)}:${toVerb(spec.verb)}:${resolveFactoryMode(spec.mode)}`),
  };
}

const matrixFromPayloads = <T extends readonly WorkPayload[]>(...payloads: T) => {
  const specs = payloads.map((payload, index) =>
    defineWorkFactories({
      domain: payload.domain,
      verb: payload.verb,
      mode: payload.mode,
      input: payload,
      output: defaultOutput(payload.domain, payload.verb, payload.mode, payload),
      score: index,
      status: payload.weight > 50 ? 'warn' : 'ok',
    }) as WorkFactoryItem,
  );
  return registerWorkloadPipeline(...(specs as readonly WorkFactoryItem[]));
};

export const adaptiveRunner = <T extends readonly WorkPayload[]>(payloads: T) => {
  const catalog = matrixFromPayloads(...payloads);
  return createPipelineRunner(catalog.specs);
};

export const noInferWorkPayload = <T extends WorkPayload>(value: NoInfer<T>): T => value;
export const noInferAdvancedMarker = <T>(value: NoInferAdvanced<T>): T => value;
