import type { Brand, NoInfer } from './patterns';

export type SolverKind = 'scalar' | 'mapped' | 'tuple' | 'union' | 'graph' | 'matrix' | 'hybrid' | 'dispatch';
export type SolverState = 'idle' | 'boot' | 'active' | 'blocked' | 'done';

export interface SolverRecord<K extends SolverKind, N extends number, P extends object = {}> {
  readonly kind: K;
  readonly level: N;
  readonly payload: P;
}

export type SolverPayload<K extends SolverKind> =
  K extends 'scalar'
    ? { readonly scale: number }
    : K extends 'mapped'
      ? { readonly map: Map<string, string> }
      : K extends 'tuple'
        ? { readonly tuple: readonly unknown[] }
        : K extends 'union'
          ? { readonly union: readonly [string, string, string] }
          : K extends 'graph'
            ? { readonly nodes: readonly string[] }
            : K extends 'matrix'
              ? { readonly matrix: readonly number[][] }
              : K extends 'hybrid'
                ? { readonly hybrid: true }
                : { readonly dispatch: Brand<string, 'dispatch-id'> };

export type SolverInput<K extends SolverKind> = SolverRecord<K, K extends 'scalar' ? 0 : 1, SolverPayload<K>>;

export type SolverOutput<K extends SolverKind> = {
  readonly kind: K;
  readonly state: SolverState;
  readonly trace: readonly `event:${K}`[];
};

export interface InstantiationSuite {
  readonly alpha: SolverInput<'scalar'>;
  readonly beta: SolverInput<'mapped'>;
  readonly gamma: SolverInput<'tuple'>;
  readonly delta: SolverInput<'union'>;
  readonly epsilon: SolverInput<'graph'>;
  readonly zeta: SolverInput<'matrix'>;
  readonly eta: SolverInput<'hybrid'>;
  readonly theta: SolverInput<'dispatch'>;
}

export const solverSuite: InstantiationSuite = {
  alpha: { kind: 'scalar', level: 0, payload: { scale: 1 } },
  beta: { kind: 'mapped', level: 1, payload: { map: new Map([['k', 'v']]) } },
  gamma: { kind: 'tuple', level: 1, payload: { tuple: [1, 2, 3] } },
  delta: { kind: 'union', level: 1, payload: { union: ['a', 'b', 'c'] } },
  epsilon: { kind: 'graph', level: 1, payload: { nodes: ['n1', 'n2', 'n3'] } },
  zeta: { kind: 'matrix', level: 1, payload: { matrix: [[1, 2], [3, 4]] } },
  eta: { kind: 'hybrid', level: 1, payload: { hybrid: true } },
  theta: { kind: 'dispatch', level: 1, payload: { dispatch: 'dispatch:1' as Brand<string, 'dispatch-id'> } },
};

export type SolverTuple = readonly [
  SolverInput<'scalar'>,
  SolverInput<'mapped'>,
  SolverInput<'tuple'>,
  SolverInput<'union'>,
  SolverInput<'graph'>,
  SolverInput<'matrix'>,
  SolverInput<'hybrid'>,
  SolverInput<'dispatch'>,
];

export type SolverUnion = SolverTuple[number];

export type SolverMatrix<T extends readonly SolverKind[]> = {
  [K in keyof T]: T[K] extends SolverKind ? SolverInput<T[K]> : never;
};

export function instantiateSolver(kind: 'scalar', payload: SolverPayload<'scalar'>, label?: string): SolverOutput<'scalar'>;
export function instantiateSolver(kind: 'mapped', payload: SolverPayload<'mapped'>, label?: string): SolverOutput<'mapped'>;
export function instantiateSolver(kind: 'tuple', payload: SolverPayload<'tuple'>, label?: string): SolverOutput<'tuple'>;
export function instantiateSolver(kind: 'union', payload: SolverPayload<'union'>, label?: string): SolverOutput<'union'>;
export function instantiateSolver(kind: 'graph', payload: SolverPayload<'graph'>, label?: string): SolverOutput<'graph'>;
export function instantiateSolver(kind: 'matrix', payload: SolverPayload<'matrix'>, label?: string): SolverOutput<'matrix'>;
export function instantiateSolver(kind: 'hybrid', payload: SolverPayload<'hybrid'>, label?: string): SolverOutput<'hybrid'>;
export function instantiateSolver(kind: 'dispatch', payload: SolverPayload<'dispatch'>, label?: string): SolverOutput<'dispatch'>;
export function instantiateSolver<T extends SolverKind>(
  kind: T,
  payload: NoInfer<SolverPayload<T>>,
  _label?: string,
): SolverOutput<T> {
  const suffix = `${kind}:${_label ?? 'default'}`;
  const trace = [suffix, `${kind}-booted`, `${kind}-done`] as const;
  return {
    kind,
    state: payload ? 'active' : 'idle',
    trace: trace as readonly `event:${T}`[],
  } as SolverOutput<T>;
}

export function runSolverMatrix<T extends readonly SolverKind[]>(spec: SolverMatrix<T>): readonly SolverOutput<T[number]>[] {
  const outputs: SolverOutput<T[number]>[] = [];
  for (let index = 0; index < spec.length; index += 1) {
    const item = spec[index];
    if (!item || typeof item !== 'object') {
      continue;
    }
    if (item.kind === 'scalar') {
      outputs.push(instantiateSolver('scalar', item.payload as SolverPayload<'scalar'>, `item-${index}`) as SolverOutput<T[number]>);
    } else if (item.kind === 'mapped') {
      outputs.push(instantiateSolver('mapped', item.payload as SolverPayload<'mapped'>, `item-${index}`) as SolverOutput<T[number]>);
    } else if (item.kind === 'tuple') {
      outputs.push(instantiateSolver('tuple', item.payload as SolverPayload<'tuple'>, `item-${index}`) as SolverOutput<T[number]>);
    } else if (item.kind === 'union') {
      outputs.push(instantiateSolver('union', item.payload as SolverPayload<'union'>, `item-${index}`) as SolverOutput<T[number]>);
    } else if (item.kind === 'graph') {
      outputs.push(instantiateSolver('graph', item.payload as SolverPayload<'graph'>, `item-${index}`) as SolverOutput<T[number]>);
    } else if (item.kind === 'matrix') {
      outputs.push(instantiateSolver('matrix', item.payload as SolverPayload<'matrix'>, `item-${index}`) as SolverOutput<T[number]>);
    } else if (item.kind === 'hybrid') {
      outputs.push(instantiateSolver('hybrid', item.payload as SolverPayload<'hybrid'>, `item-${index}`) as SolverOutput<T[number]>);
    } else {
      outputs.push(instantiateSolver('dispatch', item.payload as SolverPayload<'dispatch'>, `item-${index}`) as SolverOutput<T[number]>);
    }
  }
  return outputs;
}

export const solverMatrixInput = [
  solverSuite.alpha,
  solverSuite.beta,
  solverSuite.gamma,
  solverSuite.delta,
  solverSuite.epsilon,
  solverSuite.zeta,
  solverSuite.eta,
  solverSuite.theta,
] as const;

export const solverResults = runSolverMatrix(solverMatrixInput);

export type SolverRegistry = {
  readonly scalar: SolverOutput<'scalar'>;
  readonly mapped: SolverOutput<'mapped'>;
  readonly tuple: SolverOutput<'tuple'>;
  readonly union: SolverOutput<'union'>;
  readonly graph: SolverOutput<'graph'>;
  readonly matrix: SolverOutput<'matrix'>;
  readonly hybrid: SolverOutput<'hybrid'>;
  readonly dispatch: SolverOutput<'dispatch'>;
};

export const registerSuite = (): SolverRegistry => ({
  scalar: instantiateSolver('scalar', solverSuite.alpha.payload, 'scalar'),
  mapped: instantiateSolver('mapped', solverSuite.beta.payload, 'mapped'),
  tuple: instantiateSolver('tuple', solverSuite.gamma.payload, 'tuple'),
  union: instantiateSolver('union', solverSuite.delta.payload, 'union'),
  graph: instantiateSolver('graph', solverSuite.epsilon.payload, 'graph'),
  matrix: instantiateSolver('matrix', solverSuite.zeta.payload, 'matrix'),
  hybrid: instantiateSolver('hybrid', solverSuite.eta.payload, 'hybrid'),
  dispatch: instantiateSolver('dispatch', solverSuite.theta.payload, 'dispatch'),
});
