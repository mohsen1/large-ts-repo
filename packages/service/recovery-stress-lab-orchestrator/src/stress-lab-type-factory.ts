import {
  type ConstraintFunctionSet,
  type ConstraintTuple,
  type NoInfer,
} from '@shared/type-level/stress-instantiation-overload-hub';
import { type RouteTupleLike } from '@shared/type-level/stress-recursive-constraint-lattice';
import type { StressBlueprintRegistry } from '@domain/recovery-stress-lab';
import { buildStressBlueprintRegistry } from '@domain/recovery-stress-lab';
import {
  runWorkspace,
  type WorkspaceNamespace,
} from '@shared/stress-lab-runtime';

export type StressLabFactoryInput = {
  readonly tenantId: string;
  readonly namespace: string;
  readonly command: RouteTupleLike;
};

export type StressLabFactoryState<TContext extends object = Record<string, unknown>> = {
  readonly tenantId: string;
  readonly namespace: WorkspaceNamespace;
  readonly input: TContext;
  readonly routes: readonly RouteTupleLike[];
};

type ConstraintResolver = ConstraintFunctionSet;
type RegistryInput = {
  registry: StressBlueprintRegistry;
  route: RouteTupleLike;
  constraint: string;
};

const constraintResolver: ConstraintResolver = ((value: string, scope?: string, layer?: string) => {
  if (scope === undefined) {
    return `${value}-tag`;
  }
  if (layer === undefined) {
    return `${value}-${scope}` as string;
  }
  return `${value}-${scope}-${layer}`;
}) as ConstraintFunctionSet;

export const createFactorySeed = <TSeed extends string>(seed: TSeed): {
  readonly label: `${TSeed}-factory`;
  readonly seed: TSeed;
} => ({
  label: `${seed}-factory`,
  seed,
});

export function runStressLabFactory<TContext extends { namespace: string }, TConstraint extends string>(
  input: StressLabFactoryInput,
  context: TContext,
  namespace: WorkspaceNamespace,
): Promise<StressLabFactoryState<TContext>>;
export function runStressLabFactory<TContext extends { namespace: string }, TConstraint extends string>(
  input: StressLabFactoryInput,
  context: TContext,
  namespace: WorkspaceNamespace,
  constraint?: NoInfer<TConstraint>,
  extra?: TConstraint,
): Promise<StressLabFactoryState<TContext>>;
export async function runStressLabFactory<TContext extends { namespace: string }, TConstraint extends string>(
  input: StressLabFactoryInput,
  context: TContext,
  namespace: WorkspaceNamespace,
  constraint?: NoInfer<TConstraint>,
): Promise<StressLabFactoryState<TContext>> {
  const blueprint = buildStressBlueprintRegistry(input.tenantId);
  const fallbackPlan: readonly RouteTupleLike[] = ['atlas/bootstrap/seed', 'drill/execute/run', 'timeline/execute/plan'];
  const plan = blueprint.blueprints.at(0)?.routes ?? fallbackPlan;
  const resolved = (constraint === undefined ? input.command : constraint) as RouteTupleLike;
  const payload: StressLabFactoryState<TContext> = {
    tenantId: input.tenantId,
    namespace,
    input: { ...context, namespace: input.command },
    routes: [...plan, resolved] as unknown as readonly RouteTupleLike[],
  };
  await runWorkspace(context.namespace, [], payload as unknown as never);
  return payload;
}

export const createConstraintTuple = <A extends string, B extends string>(
  a: A,
  b: B,
): ConstraintTuple<readonly [A, B]> => Object.assign([a, b] as [A, B], {
  values: [a, b] as readonly [A, B],
} as ConstraintTuple<readonly [A, B]>);

export const createRegistryBundle = async (tenantId: string): Promise<RegistryInput[]> => {
  const registry = buildStressBlueprintRegistry(tenantId);
  return registry.blueprints.map((blueprint, index) => ({
    registry,
    route: (Object.values(registry.routeLookup)[index] as RouteTupleLike) ?? 'atlas/bootstrap/seed',
    constraint: constraintResolver(`${blueprint.domain}:${blueprint.profile}`),
  }));
};

export const executeFactoryGraph = async <T>(
  envelope: T,
  routes: readonly RouteTupleLike[],
): Promise<{
  input: T;
  routes: readonly RouteTupleLike[];
  resolved: {
    readonly raw: RouteTupleLike;
    readonly domain: string;
    readonly action: string;
    readonly scope: string;
    readonly domainProfile: {
      readonly scope: string;
      readonly tier: number;
      readonly criticality: 'low' | 'medium' | 'high' | 'critical';
    };
    readonly actionProfile: {
      readonly stage: string;
      readonly weight: number;
    };
  };
}> => {
  const resolved = {
    raw: 'atlas/bootstrap/seed' as RouteTupleLike,
    domain: 'atlas',
    action: 'bootstrap',
    scope: 'seed',
    domainProfile: { scope: 'catalog', tier: 1, criticality: 'low' as const },
    actionProfile: { stage: 'begin', weight: 1 },
  };
  return {
    input: envelope,
    routes,
    resolved,
  };
};
