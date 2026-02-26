import type { NoInfer } from './patterns';

export type SolverDomain =
  | 'incident'
  | 'workload'
  | 'control'
  | 'risk'
  | 'timeline'
  | 'orchestrator';

export type SolverVerb =
  | 'discover'
  | 'assess'
  | 'repair'
  | 'recover'
  | 'simulate';

export type SolverSeverity = 'low' | 'medium' | 'high' | 'critical';

export type SolverInput<TDomain extends SolverDomain> = {
  readonly tenant: `${TDomain}-tenant`;
  readonly namespace: `${TDomain}-ns`;
};

export type SolverOutputState =
  | 'queued'
  | 'running'
  | 'suspended'
  | 'failed'
  | 'succeeded';

export interface SolverEnvelope<TDomain extends SolverDomain, TVerb extends SolverVerb, TPayload extends Record<string, unknown>> {
  readonly domain: TDomain;
  readonly verb: TVerb;
  readonly payload: TPayload;
  readonly seed: SolverInput<TDomain>;
}

export type ConstraintNode<TDomain extends SolverDomain, TContext, TVerb extends SolverVerb = 'discover'> =
  TContext extends Record<string, unknown>
    ? TContext extends { tenant: `${TDomain}-tenant` }
      ? {
        readonly context: TContext;
        readonly domain: TDomain;
        readonly verb: TVerb;
        readonly phase: TContext extends { phase: infer P } ? P : 'default';
      }
      : never
    : never;

export type SolverConstraintChain<TDomain extends SolverDomain, TVerb extends SolverVerb, TPayload extends Record<string, unknown>> =
  TVerb extends 'discover'
    ? ConstraintNode<TDomain, SolverInput<TDomain> & { phase: 'discover' }, 'discover'> & {
      readonly discovered: true;
    }
    : TVerb extends 'assess'
      ? ConstraintNode<TDomain, SolverInput<TDomain> & { phase: 'assess' }, 'assess'> & {
        readonly assessed: true;
      }
      : TVerb extends 'repair'
        ? ConstraintNode<TDomain, SolverInput<TDomain> & { phase: 'repair' }, 'repair'> & {
          readonly repaired: true;
          readonly payload: TPayload;
        }
        : TVerb extends 'recover'
          ? ConstraintNode<TDomain, SolverInput<TDomain> & { phase: 'recover' }, 'recover'> & {
            readonly recovered: true;
          }
          : TVerb extends 'simulate'
            ? ConstraintNode<TDomain, SolverInput<TDomain> & { phase: 'simulate' }, 'simulate'> & {
              readonly simulated: true;
              readonly payload: TPayload;
            }
            : never;

export type ConstraintGraph<TDomain extends SolverDomain, TVerb extends SolverVerb, TPayload extends Record<string, unknown>> = {
  readonly head: SolverConstraintChain<TDomain, TVerb, TPayload>;
  readonly next: SolverConstraintChain<TDomain, TVerb, TPayload> | null;
};

export type ConstraintResult<TDomain extends SolverDomain, TVerb extends SolverVerb, TPayload extends Record<string, unknown>> =
  ConstraintGraph<TDomain, TVerb, TPayload> & {
    readonly ok: boolean;
    readonly output: SolverEnvelope<TDomain, TVerb, TPayload>;
  };

export interface ConstraintSolver<TDomain extends SolverDomain, TPayload extends Record<string, unknown>, TSeverity extends SolverSeverity = 'medium'> {
  readonly name: `${TDomain}-solver`;
  readonly severity: TSeverity;
  resolve<TVerb extends SolverVerb>(
    verb: TVerb,
    context: NoInfer<SolverInput<TDomain>>,
    payload: NoInfer<TPayload>,
    severity: NoInfer<TSeverity>,
  ): ConstraintResult<TDomain, TVerb, TPayload>;
}

export const createConflictSolver = <TDomain extends SolverDomain, TPayload extends Record<string, unknown>, TSeverity extends SolverSeverity>(
  domain: TDomain,
  severity: TSeverity,
) => {
  const solver: ConstraintSolver<TDomain, TPayload, TSeverity> = {
    name: `${domain}-solver`,
    severity,
    resolve<TVerb extends SolverVerb>(verb: TVerb, context: SolverInput<TDomain>, payload: TPayload, _level: TSeverity) {
      const chain: ConstraintGraph<TDomain, TVerb, TPayload> = {
        head: {
          domain,
          verb,
          payload,
          seed: context,
          ...(verb === 'discover' ? { discovered: true } : {}),
        } as unknown as SolverConstraintChain<TDomain, TVerb, TPayload>,
        next: null,
      };

      const state: SolverEnvelope<TDomain, TVerb, TPayload> = {
        domain,
        verb,
        payload,
        seed: context,
      };

      return {
        ...chain,
        ok: verb !== 'simulate',
        output: state,
      } as ConstraintResult<TDomain, TVerb, TPayload>;
    },
  };

  return solver;
};

export type { SolverInvocation } from './stress-generic-instantiation-atoll';
export { buildInvocationMatrix } from './stress-generic-instantiation-atoll';

export const runSolverConflictSuite = <
  TDomain extends SolverDomain,
  TPayload extends Record<string, unknown>,
  TVerb extends SolverVerb,
  TSeverity extends SolverSeverity,
>(
  solver: ConstraintSolver<TDomain, TPayload, TSeverity>,
  verb: TPayload extends Record<'route', string> ? TVerb : TVerb,
  payload: TPayload,
  domain: TDomain,
  severity: TSeverity,
): ConstraintResult<TDomain, TVerb, TPayload> => {
  return solver.resolve(verb, { tenant: `${domain}-tenant`, namespace: `${domain}-ns` }, payload, severity);
};

export const conflictSamples = [
  createConflictSolver<'incident', { readonly route: string }, 'critical'>('incident', 'critical'),
  createConflictSolver<'workload', { readonly scope: string; readonly route: string }, 'high'>('workload', 'high'),
  createConflictSolver<'control', { readonly scope: string; readonly command: string }, 'low'>('control', 'low'),
] as const;

export const runConflictSuite = () =>
  [
    runSolverConflictSuite(
      conflictSamples[0],
      'discover',
      { route: 'tenant-ops' },
      'incident',
      conflictSamples[0].severity,
    ),
    runSolverConflictSuite(conflictSamples[1], 'repair', { route: 'tenant-ops', scope: 'workload' }, 'workload', conflictSamples[1].severity),
    runSolverConflictSuite(
      conflictSamples[1],
      'discover',
      { route: 'tenant-ops', scope: 'workload' },
      'workload',
      conflictSamples[1].severity,
    ),
    runSolverConflictSuite(
      conflictSamples[2],
      'repair',
      { scope: 'control', command: 'stabilize' },
      'control',
      conflictSamples[2].severity,
    ),
  ];
