export type NoInfer<T> = [T][0];

export type ConstraintBrand<T extends string> = T & { readonly __brand: 'ConstraintBrand' };

export interface SolverDispatcher<in TInput, out TOutput> {
  run(input: TInput): TOutput;
}

export interface SolverEnvelope<out TConfig> {
  readonly config: TConfig;
  readonly emit: (payload: string) => void;
}

export interface Branded<T, TKind extends string> {
  readonly value: T;
  readonly kind: TKind;
}

export type Domain = 'incident' | 'policy' | 'ops' | 'recovery' | 'signal';
export type Stage = 'analyze' | 'dispatch' | 'execute' | 'verify' | 'close';
export type Severity = 'advisory' | 'low' | 'medium' | 'high' | 'critical';

export type SolverInput<
  TDomain extends Domain = Domain,
  TStage extends Stage = Stage,
  TId extends string = string,
  TSeverity extends Severity = Severity,
> = {
  readonly domain: TDomain;
  readonly stage: TStage;
  readonly id: TId;
  readonly severity: TSeverity;
};

type ActivePath<TSeverity extends Severity> = TSeverity extends 'critical' | 'high' ? true : false;

export type ResolveConstraint<TInput extends SolverInput<Domain, Stage, string, Severity>> = {
  readonly domain: TInput['domain'];
  readonly route: `${TInput['domain']}:${TInput['stage']}:${TInput['id']}`;
  readonly active: ActivePath<TInput['severity']>;
  readonly checksum: `${TInput['domain']}-${TInput['stage']}`;
};

export type ConstraintChain<
  TAnchor extends Domain,
  TCurrent extends SolverInput<TAnchor, Stage, string, Severity>,
  TNext extends SolverInput<Domain, Stage, string, Severity>,
> = {
  readonly anchor: TAnchor;
  readonly first: ResolveConstraint<TCurrent>;
  readonly second: ResolveConstraint<TNext>;
  readonly complete: true;
};

export type ConstraintMap<T extends readonly SolverInput<Domain, Stage, string, Severity>[]> = {
  [K in keyof T]: T[K] extends SolverInput<infer TDomain, infer TStage, infer TId, infer TSeverity>
    ? {
        readonly key: `${Extract<TDomain, string>}:${Extract<TStage, string>}:${Extract<TId, string>}`;
        readonly route: `${Extract<TDomain, string>}-${Extract<TStage, string>}-${Extract<TId, string>}`;
        readonly routeProfile: {
          readonly domain: Extract<TDomain, Domain>;
          readonly route: `${Extract<TDomain, string>}:${Extract<TStage, string>}:${Extract<TId, string>}`;
          readonly active: Extract<TSeverity, Severity> extends 'critical' | 'high' ? true : false;
          readonly checksum: `${Extract<TDomain, string>}-${Extract<TStage, string>}`;
        };
        readonly severity: TSeverity;
      }
    : never;
};

export type InferenceResult<TInput extends SolverInput<Domain, Stage, string, Severity>, TUnit extends string> = {
  readonly request: TInput;
  readonly route: ResolveConstraint<TInput>;
  readonly unit: ConstraintBrand<TUnit>;
  readonly checks: readonly string[];
};

export type SolverMode =
  | { readonly mode: 'strict'; readonly priority: 1 | 2 | 3; readonly checkpoint: `checkpoint-${number}` }
  | { readonly mode: 'relaxed'; readonly window: number; readonly retry: boolean }
  | { readonly mode: 'diagnostic'; readonly trace: readonly string[]; readonly latency: `${number}ms` }
  | { readonly mode: 'batch'; readonly batchSize: number; readonly drain: boolean }
  | { readonly mode: 'replay'; readonly timestamp: `${number}-${number}-${number}T${number}:${number}:${number}Z`; readonly delta: number };

export type SolverConstraintInput = {
  readonly mode: SolverMode;
  readonly payload: SolverInput<Domain, Stage, string, Severity>;
};

type SolverConstraintEnvelope = {
  readonly mode: SolverMode['mode'];
  readonly profile: InferenceResult<SolverInput<Domain, Stage, string, Severity>, string>;
  readonly checks: readonly string[];
  readonly satisfied: boolean;
};

const makePayload = (payload: SolverInput<Domain, Stage, string, Severity>): SolverConstraintEnvelope => {
  const route = resolveConstraint(payload);
  return {
    mode: 'strict',
    profile: {
      request: payload,
      route,
      unit: `${payload.domain}:${payload.stage}` as ConstraintBrand<string>,
      checks: ['base'],
    },
    checks: [route.route],
    satisfied: route.active,
  };
};

export const resolveConstraint = <
  TDomain extends Domain,
  TStage extends Stage,
  TId extends string,
  TSeverity extends Severity,
>(input: SolverInput<TDomain, TStage, TId, TSeverity>): ResolveConstraint<typeof input> => ({
  domain: input.domain,
  route: `${input.domain}:${input.stage}:${input.id}`,
  active: (input.severity === 'critical' || input.severity === 'high') as ActivePath<TSeverity>,
  checksum: `${input.domain}-${input.stage}`,
});

export const solveConstraintChain = ({ mode, payload }: SolverConstraintInput): readonly SolverConstraintEnvelope[] => {
  const base = makePayload(payload);
  if (mode.mode === 'strict') {
    return [
      {
        ...base,
        mode: 'strict',
        checks: [...base.checks, `priority:${mode.priority}`],
        satisfied: payload.severity === 'critical' || payload.severity === 'high',
      },
      {
        ...base,
        mode: 'strict',
        checks: [...base.checks, `checkpoint:${mode.checkpoint}`],
      },
    ];
  }

  if (mode.mode === 'diagnostic') {
    return [
      {
        ...base,
        mode: 'diagnostic',
        checks: [...base.checks, `trace:${mode.trace.length}`, `latency:${mode.latency}`],
      },
    ];
  }

  if (mode.mode === 'batch') {
    return [
      {
        ...base,
        mode: 'batch',
        checks: [...base.checks, `batch:${mode.batchSize}`, `drain:${mode.drain}`],
        satisfied: mode.batchSize > 0,
      },
    ];
  }

  if (mode.mode === 'replay') {
    return [
      {
        ...base,
        mode: 'replay',
        checks: [...base.checks, `replay:${mode.timestamp}`, `delta:${mode.delta}`],
      },
    ];
  }

  return [
    {
      ...base,
      mode: 'relaxed',
      checks: [...base.checks, `window:${mode.window}`, `retry:${mode.retry}`],
      satisfied: !mode.retry || payload.severity === 'low',
    },
  ];
};

export type OverloadedSolver = {
  <TInput extends SolverInput<'incident', 'analyze', string, Severity>>(input: TInput, trace: true): InferenceResult<TInput, `analysis-${string}`>;
  <TInput extends SolverInput<'recovery', 'execute', string, Severity>>(input: TInput, context: {
    readonly allowRetry: boolean;
    readonly maxRetries: number;
  }): InferenceResult<TInput, `recovery-${number}`>;
  <TInput extends SolverInput<'ops' | 'policy', 'dispatch', string, Severity>>(input: TInput, label: `batch-${string}`): InferenceResult<TInput, `dispatch-${string}`>;
  <TInput extends SolverInput<'policy', 'verify', string, Severity>>(input: TInput, confidence: number): InferenceResult<TInput, `verify-${number}`>;
  <TInput extends SolverInput<'signal', 'close', string, Severity>>(input: TInput, signal: Branded<string, 'signal'>): InferenceResult<TInput, `close-${string}`>;
  <TInput extends SolverInput<Domain, Stage, string, Severity>>(input: TInput): InferenceResult<TInput, `generic-${string}`>;
};

export const overloadedSolver: OverloadedSolver = ((
  input: SolverInput<Domain, Stage, string, Severity>,
  extra?: unknown,
): InferenceResult<any, `generic-${string}`> => {
  const route = resolveConstraint(input);
  const fallback = <TInput extends SolverInput<Domain, Stage, string, Severity>>(
    next: InferenceResult<TInput, string>,
  ): InferenceResult<any, `generic-${string}`> => next as InferenceResult<any, `generic-${string}`>;

  if (input.domain === 'incident' && input.stage === 'analyze' && typeof extra === 'boolean' && extra) {
    return fallback({
      request: input,
      route,
      unit: `analysis-${input.id}` as ConstraintBrand<`analysis-${string}`>,
      checks: ['analyze', `trace:${String(extra)}`],
    } as InferenceResult<typeof input, `analysis-${string}`>);
  }

  if (input.domain === 'recovery' && input.stage === 'execute' && typeof extra === 'object' && extra !== null) {
    return fallback({
      request: input,
      route,
      unit: `recovery-${String((extra as { maxRetries: number }).maxRetries ?? 1)}` as ConstraintBrand<`recovery-${number}`>,
      checks: ['execute', `retries:${String((extra as { maxRetries: number }).maxRetries ?? 1)}`],
    } as InferenceResult<typeof input, `recovery-${number}`>);
  }

  if (input.domain === 'signal' && input.stage === 'close' && typeof extra === 'object' && extra !== null) {
    return fallback({
      request: input,
      route,
      unit: `close-${String((extra as Branded<string, 'signal'>).value)}` as ConstraintBrand<`close-${string}`>,
      checks: ['close', `signal:${String((extra as Branded<string, 'signal'>).kind)}`],
    } as InferenceResult<typeof input, `close-${string}`>);
  }

  if (input.stage === 'verify' && input.domain === 'policy' && typeof extra === 'number') {
    return fallback({
      request: input,
      route,
      unit: `verify-${extra}` as ConstraintBrand<`verify-${number}`>,
      checks: ['verify', `confidence:${String(extra)}`],
    } as InferenceResult<typeof input, `verify-${number}`>);
  }

  if (input.domain === 'ops' || input.domain === 'policy') {
    return fallback({
      request: input,
      route,
      unit: `dispatch-${typeof extra === 'string' ? extra : input.id}` as ConstraintBrand<`dispatch-${string}`>,
      checks: ['dispatch', `value:${String(extra ?? input.id)}`],
    } as InferenceResult<typeof input, `dispatch-${string}`>);
  }

  return fallback({
    request: input,
    route,
    unit: `generic-${input.domain}-${input.stage}` as ConstraintBrand<`generic-${string}`>,
    checks: ['generic'],
  });
}) as OverloadedSolver;

export interface ConstraintGuard<T extends Branded<string, 'constraint'>> {
  readonly tag: T['value'];
  readonly profile: ConstraintChain<'incident', SolverInput<'incident', 'analyze', string, Severity>, SolverInput<'incident', 'verify', string, Severity>>;
  assert<U extends Branded<string, 'unit'>>(value: U): U & Branded<`asserted-${T['value']}`, 'asserted'>;
}

export class DefaultConstraintGuard<T extends Branded<string, 'constraint'>> implements ConstraintGuard<T> {
  public readonly tag: T['value'];
  public readonly profile: ConstraintChain<'incident', SolverInput<'incident', 'analyze', string, Severity>, SolverInput<'incident', 'verify', string, Severity>>;

  public constructor(tag: T['value']) {
    this.tag = tag;
    this.profile = {
      anchor: 'incident',
      first: {
        domain: 'incident',
        route: `incident:analyze:${tag}`,
        active: true,
        checksum: 'incident-analyze',
      },
      second: {
        domain: 'incident',
        route: `incident:verify:${tag}`,
        active: true,
        checksum: 'incident-verify',
      },
      complete: true,
    };
  }

  public assert<U extends Branded<string, 'unit'>>(value: U): U & Branded<`asserted-${T['value']}`, 'asserted'> {
    return {
      ...value,
      kind: `asserted-${this.tag}`,
    } as U & Branded<`asserted-${T['value']}`, 'asserted'>;
  }
}

export const constraintDispatch: SolverDispatcher<
  SolverInput<Domain, Stage, string, Severity>,
  InferenceResult<SolverInput<Domain, Stage, string, Severity>, string>
> = {
  run: (input) => {
    const value = overloadedSolver(input);
    if (value.checks.length > 0) {
      return value;
    }
    return {
      request: input,
      route: resolveConstraint(input),
      unit: 'generic-fallback' as ConstraintBrand<string>,
      checks: ['fallback'],
    };
  },
};

export const ConstraintEnvelope: {
  resolve: typeof resolveConstraint;
  solve: typeof solveConstraintChain;
  overloaded: OverloadedSolver;
  guard: (tag: Branded<string, 'constraint'>) => ConstraintGuard<Branded<string, 'constraint'>>;
  dispatch: SolverDispatcher<
    SolverInput<Domain, Stage, string, Severity>,
    InferenceResult<SolverInput<Domain, Stage, string, Severity>, string>
  >;
} = {
  resolve: resolveConstraint,
  solve: solveConstraintChain,
  overloaded: overloadedSolver,
  guard: (tag: Branded<string, 'constraint'>) => new DefaultConstraintGuard(tag.value),
  dispatch: constraintDispatch,
} as const;
