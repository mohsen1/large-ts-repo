import type { NoInfer } from './patterns';

export type ConstraintDomain = 'policy' | 'fabric' | 'signal' | 'workload' | 'continuity';
export type ConstraintAction = 'read' | 'write' | 'update' | 'delete' | 'observe';
export type ConstraintChannel = `channel:${string}`;
export type ConstraintMarker<T extends ConstraintDomain, A extends ConstraintAction> = `${T}-${A}`;

export interface ConstraintNode<TDomain extends ConstraintDomain = ConstraintDomain> {
  readonly domain: TDomain;
  readonly marker: ConstraintMarker<TDomain, ConstraintAction>;
}

export interface ResolverInputs<TDomain extends ConstraintDomain, TAction extends ConstraintAction, TMarker extends string> {
  readonly domain: TDomain;
  readonly action: TAction;
  readonly marker: TMarker;
}

export type ConstraintConstraint<
  A extends ConstraintDomain,
  B extends ConstraintMarker<A, ConstraintAction>,
  C extends readonly ConstraintNode<A>[] = readonly ConstraintNode<A>[],
> = {
  readonly domain: A;
  readonly marker: B;
  readonly nodes: C;
  readonly checksum: `${A}-${B}-${C['length']}`;
};

export type ConstrainChain<
  A extends ConstraintDomain,
  B extends ConstraintMarker<A, ConstraintAction>,
  C extends readonly ConstraintNode<A>[],
> = ConstraintConstraint<A, B, C> & {
  readonly guard: A;
  readonly mapping: Readonly<Record<A, ConstraintAction>>;
};

export type SolverResult<T extends string> = T extends `ok:${infer Id}`
  ? { readonly kind: 'ok'; readonly id: Id }
  : T extends `warn:${infer Id}`
    ? { readonly kind: 'warn'; readonly id: Id }
    : T extends `err:${infer Id}`
      ? { readonly kind: 'err'; readonly id: Id }
      : never;

export const isSolverResult = (value: string): value is `${'ok' | 'warn' | 'err'}:${string}` =>
  value.startsWith('ok:') || value.startsWith('warn:') || value.startsWith('err:');

export interface ResolverConfig<TMode extends ConstraintAction = ConstraintAction> {
  readonly mode: TMode;
  readonly channel: ConstraintChannel;
}

const allowedActions = ['read', 'write', 'update', 'delete', 'observe'] as const;
const isConstraintAction = (value: string): value is ConstraintAction => (allowedActions as readonly string[]).includes(value);

export const satisfiesMode = (value: string): value is ConstraintAction => isConstraintAction(value);

export const buildConstraintPayload = <
  A extends ConstraintDomain,
  B extends ConstraintMarker<A, ConstraintAction>,
  C extends readonly ConstraintNode<A>[],
>(
  value: ResolverInputs<A, ConstraintAction, B> & {
    readonly constraints: ConstraintConstraint<A, B, C>;
  },
): {
  readonly mode: `${ConstraintAction}:${string}`;
  readonly domain: A;
  readonly marker: B;
  readonly constraint: string;
} => {
  const { domain, action, marker, constraints } = value;
  return {
    mode: `${action}::${constraints.marker}` as `${ConstraintAction}:${string}`,
    domain,
    marker,
    constraint: `${domain}-${action}-${constraints.checksum}`,
  };
};

export const resolveWithConstraints = <
  A extends ConstraintDomain,
  B extends ConstraintMarker<A, ConstraintAction>,
  C extends readonly ConstraintNode<A>[],
>(
  value: ResolverInputs<A, ConstraintAction, B>,
  contracts: ConstraintConstraint<A, B, C>,
  options: { readonly domain: A; readonly channel: ConstraintChannel },
): SolverResult<`ok:${string}`> => {
  return {
    kind: 'ok',
    id: `${value.domain}:${options.channel}:${contracts.marker}:${contracts.checksum}`,
  };
};

export const resolveWithConstraintsRead = <
  A extends ConstraintDomain,
  B extends ConstraintMarker<A, ConstraintAction>,
  C extends readonly ConstraintNode<A>[],
>(
  value: ResolverInputs<A, 'read', B>,
  contracts: ConstraintConstraint<A, B, C>,
): SolverResult<`warn:${string}`> => {
  const checksum = contracts.checksum;
  return {
    kind: 'warn',
    id: `warn:${value.domain}:${checksum}`,
  };
};

export const resolveWithConstraintsWrite = <
  A extends ConstraintDomain,
  B extends ConstraintMarker<A, ConstraintAction>,
  C extends readonly ConstraintNode<A>[],
>(
  value: ResolverInputs<A, 'write', B>,
  contracts: ConstraintConstraint<A, B, C>,
): SolverResult<`err:${string}`> => {
  return {
    kind: 'err',
    id: `err:${value.domain}:${contracts.marker}`,
  };
};

export const resolveWithConstraintsUpdate = <
  A extends ConstraintDomain,
  B extends ConstraintMarker<A, ConstraintAction>,
  C extends readonly ConstraintNode<A>[],
>(
  value: ResolverInputs<A, 'update', B>,
  contracts: ConstraintConstraint<A, B, C>,
  tags: readonly NoInfer<string>[],
): SolverResult<`warn:${string}` | `err:${string}`> => {
  const marker = tags.includes(contracts.marker) ? `warn:${value.domain}` : `err:${value.domain}`;
  if (marker.startsWith('warn:')) {
    return {
      kind: 'warn',
      id: marker,
    };
  }

  return {
    kind: 'err',
    id: marker,
  };
};

export const resolveWithConstraintsDelete = <
  A extends ConstraintDomain,
  B extends ConstraintMarker<A, ConstraintAction>,
  C extends readonly ConstraintNode<A>[],
>(
  value: ResolverInputs<A, 'delete', B>,
  contracts: ConstraintConstraint<A, B, C>,
): SolverResult<`ok:${string}`> => {
  return {
    kind: 'ok',
    id: `ok:${value.domain}:${contracts.marker}`,
  };
};

export const resolveWithConstraintsObserve = <
  A extends ConstraintDomain,
  B extends ConstraintMarker<A, ConstraintAction>,
  C extends readonly ConstraintNode<A>[],
>(
  value: ResolverInputs<A, 'observe', B>,
  contracts: ConstraintConstraint<A, B, C>,
): SolverResult<`ok:${string}`> => {
  return {
    kind: 'ok',
    id: `ok:${value.domain}:${contracts.domain}`,
  };
};

export type ResolveAll<T extends ConstraintDomain> = SolverResult<`ok:${string}`> | SolverResult<`warn:${string}`> | SolverResult<`err:${string}`>;

export const runSolverSuite = <T extends ConstraintDomain>(domain: T): {
  readonly key: ConstraintMarker<T, ConstraintAction>;
  readonly result: ResolveAll<T>;
} => {
  const marker = `read:${domain}` as ConstraintMarker<T, 'read'>;
  const node: ConstraintNode<T> = {
    domain,
    marker: `read:${domain}` as ConstraintMarker<T, 'read'>,
  };
  const payload: ResolverInputs<T, 'read', ConstraintMarker<T, 'read'>> = {
    domain,
    marker,
    action: 'read',
  };
  const constraint: ConstraintConstraint<T, ConstraintMarker<T, 'read'>, [ConstraintNode<T>]> = {
    domain,
    marker: `read:${domain}` as ConstraintMarker<T, 'read'>,
    nodes: [node],
    checksum: `${domain}-${domain}-read-1`,
  };
  return {
    key: `read:${domain}` as ConstraintMarker<T, 'read'>,
    result: resolveWithConstraints(payload, constraint, {
      domain,
      channel: `channel:${domain}`,
    }),
  };
};
