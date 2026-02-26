import type { SolverDomain, SolverVerb } from './stress-constraint-conflict-forge';

export type DispatchSolverDomain = SolverDomain;
export type DispatchSolverVerb = SolverVerb;
export type DispatchSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface NoInferTuple<T> {
  readonly values: readonly T[];
}

export interface SolverInvocation<TInput, TTag extends string, TSeed> {
  readonly input: TInput;
  readonly tag: TTag;
  readonly seed: TSeed;
  readonly issuedAt: number;
}

export interface InvocationResult<TInput, TVerb extends DispatchSolverVerb, TOutput> {
  readonly input: TInput;
  readonly verb: TVerb;
  readonly output: TOutput;
  readonly metadata: {
    readonly timestamp: number;
    readonly trace: readonly string[];
  };
}

export type OverloadMode =
  | 'strict'
  | 'relaxed'
  | 'adaptive'
  | 'diagnostic'
  | 'emergency'
  | 'maintenance';

export function instantiateSolver<TInput, TOutput, TTag extends string>(
  input: TInput,
  output: TOutput,
  tag: TTag,
): InvocationResult<TInput, DispatchSolverVerb, TOutput>;

export function instantiateSolver<TInput, TOutput, TTag extends string, TMeta>(
  input: TInput,
  output: TOutput,
  tag: TTag,
  meta: TMeta,
): InvocationResult<TInput, DispatchSolverVerb, TOutput>;

export function instantiateSolver<TInput, TOutput, TTag extends string, TMeta>(
  input: TInput,
  output: TOutput,
  tag: TTag,
  meta?: TMeta,
): InvocationResult<TInput, DispatchSolverVerb, TOutput> {
  const tagSeed = String(tag);
  const metadata = {
    timestamp: Date.now(),
    trace: [`${tagSeed}:${typeof input}`, `${typeof output}`, meta === undefined ? 'no-meta' : 'has-meta'],
  };

  const verb = tagSeed.includes('discover')
    ? 'discover'
    : tagSeed.includes('assess')
      ? 'assess'
      : tagSeed.includes('repair')
        ? 'repair'
        : tagSeed.includes('recover')
          ? 'recover'
          : 'simulate';

  return {
    input,
    verb,
    output,
    metadata,
  } as InvocationResult<TInput, DispatchSolverVerb, TOutput>;
}

export const buildInvocationMatrix = <
  const T extends readonly SolverInvocation<any, string, any>[],
  const M extends readonly OverloadMode[]
>(input: T, modes: M) => {
  const output: InvocationResult<unknown, DispatchSolverVerb, unknown>[] = [];

  for (let index = 0; index < input.length; index += 1) {
    const invocation = input[index]!;
    const mode = modes[index % modes.length] as OverloadMode;
    const result = instantiateSolver(invocation.input, invocation.seed, `${mode}:${invocation.tag}` as const);

    if (mode === 'strict') {
      output.push(result);
    }

    if (mode === 'relaxed' || mode === 'adaptive') {
      output.push(result, instantiateSolver(invocation.input, invocation.seed, `${mode}-secondary` as const));
    }

    if (mode === 'diagnostic') {
      output.push(instantiateSolver(invocation.input, invocation.seed, `${mode}-diag`, { index, mode }));
    }

    if (mode === 'emergency') {
      output.push(
        instantiateSolver(invocation.input, invocation.seed, `${mode}-burst` as const),
        instantiateSolver(invocation.input, invocation.seed, `${mode}-recovery` as const),
        instantiateSolver(invocation.input, invocation.seed, `${mode}-recovery-stage-2` as const),
      );
    }

    if (mode === 'maintenance') {
      for (let stage = 0; stage < 3; stage += 1) {
        output.push(
          instantiateSolver(invocation.input, invocation.seed, `${mode}-${stage}` as const, {
            index,
            stage,
            domain: invocation.tag as string,
          }),
        );
      }
    }
  }

  return output;
};

export const invocationCatalog: readonly SolverInvocation<string, string, { tenant: string }>[] = [
  { input: 'route-a', tag: 'discover', seed: { tenant: 'incident' }, issuedAt: 1 },
  { input: 'route-b', tag: 'assess', seed: { tenant: 'workload' }, issuedAt: 2 },
  { input: 'route-c', tag: 'repair', seed: { tenant: 'control' }, issuedAt: 3 },
  { input: 'route-d', tag: 'recover', seed: { tenant: 'risk' }, issuedAt: 4 },
  { input: 'route-e', tag: 'simulate', seed: { tenant: 'policy' }, issuedAt: 5 },
] as const;

export const overloadInvocations = buildInvocationMatrix(invocationCatalog, [
  'strict',
  'relaxed',
  'adaptive',
  'diagnostic',
  'emergency',
  'maintenance',
] as const);

export const mapInvocationSignature = (invocations: readonly InvocationResult<unknown, DispatchSolverVerb, unknown>[]) => {
  const signatures = new Map<string, number>();
  for (const invocation of invocations) {
    const key = `${invocation.verb}:${invocation.metadata.trace[0]}`;
    signatures.set(key, (signatures.get(key) ?? 0) + 1);
  }
  return signatures;
};

export const overloadSignature = mapInvocationSignature(overloadInvocations);

export type InvocationSignature = typeof overloadSignature extends Map<infer K, infer V> ? `${K & string}:${V & number}` : never;
