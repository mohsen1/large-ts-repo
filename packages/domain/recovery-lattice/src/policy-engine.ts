import { withBrand, type Brand } from '@shared/core';
import { NoInfer, OmitNever, Optionalize, RecursivePath, UnionToIntersection } from '@shared/type-level';
import {
  asRouteId,
  asTenantId,
  type LatticeContext,
  type LatticeRouteId,
  type LatticeTenantId,
} from './ids';
import {
  type NestedPath,
  evaluatePolicy,
  type ConstraintTuple,
  type ConstraintPolicy,
  type ConstraintGraphNode,
} from './constraints';
import { type LatticeBlueprintManifest, type LatticeBlueprintStep } from './blueprints';
import { createPlanContext } from './planning';

export type PolicyMode = 'strict' | 'adaptive' | 'observe';
export type PolicyImpact = 'allow' | 'observe' | 'limit' | 'deny';
export type PolicyDirection = 'inbound' | 'outbound' | 'internal';

export type LatticePolicyId<T extends string = string> = Brand<string, `lattice-policy:${T}:id`>;
export type PolicyRouteMask<T extends string = string> = `policy::${T}`;

export interface PolicyConstraintSpec<
  TContext extends Record<string, unknown> = Record<string, unknown>,
  TPath extends string = NestedPath<TContext> & string,
> {
  readonly path: TPath;
  readonly pathValues: readonly string[];
  readonly operator: 'in' | 'notIn' | 'contains' | 'equals';
}

export type ContextPathValue<TContext, TPath extends string> = TPath extends string
  ? TPath extends `${infer Head}.${infer Tail}`
    ? Head extends keyof TContext
      ? ContextPathValue<TContext[Head], Tail>
      : unknown
    : TPath extends keyof TContext
      ? TContext[TPath]
      : unknown
  : never;

export type PolicyTuple<TItems extends readonly ConstraintTuple[]> =
  TItems extends readonly [infer Head extends ConstraintTuple<string>, ...infer Tail extends readonly ConstraintTuple<string>[]]
    ? readonly [Head, ...PolicyTuple<Tail>]
    : readonly [];

export type PolicyFingerprint<T extends readonly ConstraintTuple[]> = T extends readonly [
  infer Head extends ConstraintTuple,
  ...infer Tail extends readonly ConstraintTuple[],
]
  ? Head[1] extends { path: infer P; operator: infer O }
    ? `${P & string}:${O & string}::${PolicyFingerprint<Tail>}`
    : `entry::${PolicyFingerprint<Tail>}`
  : 'leaf';

export interface PolicyRule<TContext extends Record<string, unknown> = Record<string, unknown>> {
  readonly policyId: LatticePolicyId<string>;
  readonly tenantId: LatticeTenantId;
  readonly direction: PolicyDirection;
  readonly route: LatticeRouteId;
  readonly mode: PolicyMode;
  readonly impact: PolicyImpact;
  readonly constraints: readonly ConstraintTuple<NestedPath<TContext> & string>[];
  readonly createdAt: string;
}

export interface PolicyManifest<TContext extends Record<string, unknown> = Record<string, unknown>> {
  readonly tenantId: LatticeTenantId;
  readonly route: LatticeRouteId;
  readonly policies: readonly PolicyRule<TContext>[];
  readonly direction: PolicyDirection;
}

export interface PolicyDecision<TContext extends Record<string, unknown> = Record<string, unknown>> {
  readonly policyId: LatticePolicyId<string>;
  readonly route: LatticeRouteId;
  readonly impact: PolicyImpact;
  readonly trace: readonly string[];
  readonly context: TContext;
}

export type PolicyEvaluationInput<
  TContext extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly tenantId: LatticeTenantId;
  readonly route: LatticeRouteId;
  readonly mode: PolicyMode;
  readonly constraints: readonly ConstraintTuple<NestedPath<TContext> & string>[];
  readonly graph?: readonly ConstraintGraphNode<TContext>[];
};

export type PolicyEvaluatorResult<TContext extends Record<string, unknown> = Record<string, unknown>> = {
  readonly route: LatticeRouteId;
  readonly allow: boolean;
  readonly impact: PolicyImpact;
  readonly decisions: readonly PolicyDecision<TContext>[];
  readonly trace: readonly string[];
  readonly score: number;
};

export type PolicyTagMap<TContext extends Record<string, unknown>> = {
  [K in keyof TContext as `tag:${K & string}`]: TContext[K];
};

export type PolicyBlueprintCoverage<TBlueprint extends LatticeBlueprintManifest> = {
  readonly route: TBlueprint['route'];
  readonly version: TBlueprint['version'];
  readonly coverage: TBlueprint['steps'][number]['kind'][];
};

const getAsyncStack = (): {
  new (): {
    use(resource: object & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void;
    [Symbol.asyncDispose](): PromiseLike<void>;
  };
} => {
  const fallback = class {
    readonly #disposables: Array<() => void | PromiseLike<void>> = [];

    use(resource: object & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void {
      const disposer = resource?.[Symbol.asyncDispose];
      if (typeof disposer === 'function') {
        this.#disposables.push(() => disposer.call(resource));
      }
    }

    async [Symbol.asyncDispose](): Promise<void> {
      while (this.#disposables.length > 0) {
        const dispose = this.#disposables.pop();
        if (dispose) {
          dispose();
        }
      }
    }
  };

  return (
    (globalThis as {
      AsyncDisposableStack?: { new (): {
        use(resource: object & { [Symbol.asyncDispose]?: () => PromiseLike<void> }): void;
        [Symbol.asyncDispose](): PromiseLike<void>;
      } };
    }).AsyncDisposableStack ?? fallback
  );
};

type PolicyTemplate = {
  readonly tenant: string;
  readonly route: string;
  readonly mode: PolicyMode;
  readonly impact: PolicyImpact;
};

const seededTemplates: readonly PolicyTemplate[] = [
  {
    tenant: 'tenant:default',
    route: 'route:seed:global',
    mode: 'adaptive',
    impact: 'allow',
  },
  {
    tenant: 'tenant:default',
    route: 'route:seed:critical',
    mode: 'strict',
    impact: 'limit',
  },
  {
    tenant: 'tenant:default',
    route: 'route:seed:observe',
    mode: 'observe',
    impact: 'observe',
  },
];

const normalizeTenant = (tenantId: string): LatticeTenantId => asTenantId(tenantId);

const mapConstraintPath = <TContext extends Record<string, unknown>, TPath extends string>(
  context: TContext,
  path: NoInfer<TPath>,
): ContextPathValue<TContext, TPath> => {
  return path
    .split('.')
    .reduce<unknown>((acc, segment) => {
      if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
      return (acc as Record<string, unknown>)[segment];
    }, context as unknown as Record<string, unknown>) as ContextPathValue<TContext, TPath>;
};

const makePolicyId = (tenantId: LatticeTenantId, route: LatticeRouteId, index: number): LatticePolicyId<string> =>
  withBrand(`policy:${tenantId}:${route}:${index}`, `lattice-policy:${tenantId}:${route}:id`) as LatticePolicyId<string>;

export const seedPolicyManifests = (
  tenants: readonly string[],
): readonly PolicyManifest[] => {
  const templates = seededTemplates.toSorted((left, right) => left.route.localeCompare(right.route));
  const manifests: PolicyManifest[] = [];

  for (const tenant of tenants) {
    for (const [index, template] of templates.entries()) {
      const tenantId = normalizeTenant(tenant);
      const route = asRouteId(template.route);
      manifests.push({
        tenantId,
        route,
        direction: index % 2 === 0 ? 'inbound' : 'internal',
        policies: [
          {
            policyId: makePolicyId(tenantId, route, index),
            tenantId,
            direction: index % 2 === 0 ? 'inbound' : 'internal',
            route,
            mode: template.mode,
            impact: template.impact,
            constraints: [
              [
                template.impact === 'deny' ? 'deny' : 'allow',
                {
                  operator: 'eq',
                  path: 'tenantId',
                  value: tenantId,
                },
              ] as const,
            ],
            createdAt: new Date().toISOString(),
          },
        ],
      });
    }
  }

  return manifests;
};

const resolveConstraint = <TContext extends Record<string, unknown>, TConstraint extends ConstraintTuple<NestedPath<TContext> & string>>(
  context: TContext,
  constraint: TConstraint,
): PolicyDecision<TContext> => {
  const policy = mapConstraintPath(context, constraint[1].path as string);
  return {
    policyId: makePolicyId(
      createPlanContext(asTenantId('tenant:runtime')).tenantId,
      asRouteId(String(context.regionId ?? 'route:runtime')),
      Math.max(0, Number(policy) || 0),
    ),
    route: context.requestId ? (asRouteId(`route:${String(context.requestId)}`) as LatticeRouteId) : asRouteId('route:runtime'),
    impact: constraint[0] === 'deny' ? 'deny' : 'allow',
    trace: [
      `resolved:${constraint[1].path}:${String(policy ?? 'none')}`,
      `mode:${constraint[0]}`,
    ],
    context: { ...context },
  };
};

const evaluatePolicyGroup = <
  TContext extends Record<string, unknown>,
  TMode extends PolicyMode,
>(
  context: TContext,
  input: PolicyEvaluationInput<TContext>,
  mode: NoInfer<TMode>,
): PolicyEvaluatorResult<TContext> => {
  const decisions = input.constraints.map((entry) => {
    const evaluated = evaluatePolicy(context, [entry] as readonly [ConstraintTuple<NestedPath<TContext> & string>]);
    const first = resolveConstraint(context, entry);
    const impact: PolicyImpact = evaluated.some((sample) => sample.score < 1)
      ? evaluated.some((sample) => sample.matched === false)
        ? 'deny'
        : 'limit'
      : mode === 'strict'
        ? 'allow'
        : mode === 'adaptive'
          ? 'observe'
          : 'allow';
    return { ...first, impact };
  });

  const score = decisions.reduce((acc, current) => acc + (current.trace.length * (current.impact === 'deny' ? 0 : 1)), 0);
  return {
    route: input.route,
    allow: decisions.every((entry) => entry.impact !== 'deny'),
    impact: score > 0 ? (decisions.some((entry) => entry.impact === 'deny') ? 'deny' : 'allow') : 'observe',
    decisions,
    trace: decisions.flatMap((entry) => entry.trace),
    score,
  };
};

export const buildPolicyTagContext = <TContext extends Record<string, unknown>>(
  route: LatticeRouteId,
  context: TContext,
): PolicyTagMap<TContext> & TContext => {
  const entries = Object.entries(context).reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[`tag:${key}`] = value;
    return acc;
  }, {});
  return { ...context, ...entries } as PolicyTagMap<TContext> & TContext;
};

export const buildBlueprintCoverage = <TBlueprint extends LatticeBlueprintManifest>(
  blueprint: TBlueprint,
): PolicyBlueprintCoverage<TBlueprint> => {
  return {
    route: blueprint.route,
    version: blueprint.version,
    coverage: blueprint.steps.map((step) => step.kind),
  };
};

export class LatticePolicyEngine<TContext extends Record<string, unknown> = Record<string, unknown>> {
  readonly #tenantId: LatticeTenantId;
  readonly #manifests = new Map<string, PolicyManifest<TContext>>();
  readonly #routeToRules = new Map<string, PolicyRule<TContext>[]>();
  #state: 'ready' | 'draining' | 'closed' = 'ready';

  public constructor(tenantId: LatticeTenantId, manifests: readonly PolicyManifest<TContext>[] = []) {
    this.#tenantId = tenantId;
    this.bulkAdd(manifests);
  }

  public list(): readonly PolicyManifest<TContext>[] {
    return [...this.#manifests.values()];
  }

  public get routeCount(): number {
    return this.#routeToRules.size;
  }

  public bulkAdd(manifests: readonly PolicyManifest<TContext>[]): void {
    for (const manifest of manifests) {
      if (manifest.tenantId !== this.#tenantId) continue;
      const key = manifest.route;
      const prior = this.#manifests.get(key);
      const policies = prior ? [...prior.policies] : [];
      this.#manifests.set(key, {
        ...manifest,
        policies: [...policies, ...manifest.policies],
      });
      this.#routeToRules.set(key, [
        ...(this.#routeToRules.get(key) ?? []),
        ...manifest.policies,
      ]);
    }
  }

  public evaluate(input: PolicyEvaluationInput<TContext>): PolicyEvaluatorResult<TContext> {
    const routeKey = String(input.route);
    const manifest = this.#manifests.get(routeKey);
    if (!manifest) {
      const context = buildPolicyTagContext(input.route, createPlanContext(this.#tenantId));
      const taggedContext = context as unknown as TContext & Record<string, unknown>;
      return {
        route: input.route,
        allow: true,
        impact: input.mode === 'strict' ? 'observe' : 'allow',
        decisions: [
          {
            policyId: makePolicyId(this.#tenantId, input.route, 0),
            route: input.route,
            impact: 'allow',
            trace: ['missing-manifest'],
            context: taggedContext as TContext,
          },
        ],
        trace: ['manifest-miss'],
        score: 1,
      };
    }

    const context = createPlanContext(this.#tenantId) as unknown as TContext;
    const policies = input.mode === 'strict'
      ? manifest.policies
      : manifest.policies.filter((policy) => policy.mode !== 'strict');

    const result = evaluatePolicyGroup(
      context,
      {
        tenantId: this.#tenantId,
        route: input.route,
        mode: input.mode,
        constraints: input.constraints,
      },
      input.mode,
    );

    const combined = policies.reduce((acc, policy) => {
      const filtered = input.constraints.filter((entry) => policy.constraints.flat().length > 0);
      const policyTrace = evaluatePolicy(context, filtered as ConstraintTuple<NestedPath<TContext> & string>[]);
      const score = policyTrace.reduce((sum, value) => sum + (value.matched ? 1 : 0), 0);
      return {
        allow: acc.allow && score >= 0,
        score: acc.score + score,
        trace: [...acc.trace, `policy:${policy.policyId}:${policy.impact}`],
      };
    }, { allow: true, score: 0, trace: [...result.trace] as string[] });

    return {
      route: input.route,
      allow: combined.allow && result.allow,
      impact: combined.allow ? result.impact : 'deny',
      decisions: [
        ...result.decisions,
        {
          policyId: makePolicyId(this.#tenantId, input.route, policies.length),
          route: input.route,
          impact: combined.allow ? 'allow' : 'deny',
          trace: combined.trace,
          context: {
            tenantId: this.#tenantId,
            regionId: createPlanContext(this.#tenantId).regionId,
            zoneId: createPlanContext(this.#tenantId).zoneId,
            requestId: createPlanContext(this.#tenantId).requestId,
          } as unknown as TContext,
        },
      ],
      trace: combined.trace,
      score: combined.score,
    };
  }

  public inferPolicyCoverage<TBlueprint extends LatticeBlueprintManifest>(
    blueprint: TBlueprint,
  ): PolicyBlueprintCoverage<TBlueprint> {
    return buildBlueprintCoverage(blueprint);
  }

  public async [Symbol.asyncDispose](): Promise<void> {
    const stack = new (getAsyncStack())();
    const disposable = {
      [Symbol.asyncDispose]: async () => {
        this.#state = 'closed';
      },
    };
    stack.use(disposable);
    await stack[Symbol.asyncDispose]();
  }

  public close(): void {
    this.#state = 'draining';
    this.#manifests.clear();
    this.#routeToRules.clear();
    this.#state = 'closed';
  }
}

type RouteSignature<T extends readonly LatticeBlueprintStep[]> = T extends readonly [
  infer Head extends LatticeBlueprintStep,
  ...infer Tail extends readonly LatticeBlueprintStep[],
]
  ? `${Head['kind']}::${Head['target']}` | RouteSignature<Tail>
  : never;

type RouteSignatureFromManifest<T extends LatticeBlueprintManifest> =
  T['steps'] extends readonly LatticeBlueprintStep[]
    ? RouteSignature<T['steps']>
    : never;

export type PolicySignature<TContext extends Record<string, unknown>> = (
  context: TContext,
) => RouteSignatureFromManifest<LatticeBlueprintManifest>;

export interface PolicyCompiler<TContext extends Record<string, unknown>> {
  readonly tenantId: LatticeTenantId;
  readonly signatures: readonly Readonly<Record<string, string>>[];
  compile(manifest: PolicyManifest<TContext>): PolicyEvaluatorResult<TContext>;
  signature: PolicySignature<TContext>;
}

export const toPolicyFingerprint = <
  TContext extends Record<string, unknown>,
>(
  context: TContext,
): string => {
  const keys = Object.keys(context).sort().slice(0, 10);
  return keys
    .map((key) => `${key}=${String((context as Record<string, unknown>)[key])}`)
    .toSorted()
    .join('&');
};

export const compilePolicyContext = <
  TInput extends Record<string, unknown>,
>(
  tenantId: LatticeTenantId,
  context: NoInfer<TInput>,
): UnionToIntersection<TInput & LatticeContext> => {
  const base = createPlanContext(tenantId);
  const entries = Object.entries(context).sort(([left], [right]) => left.localeCompare(right));
  const merged = entries.reduce((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, { ...base } as Record<string, unknown>);
  const normalized: LatticeContext = {
    tenantId: merged.tenantId as LatticeTenantId,
    regionId: base.regionId,
    zoneId: base.zoneId,
    requestId: base.requestId,
    ...merged,
  };
  return normalized as UnionToIntersection<TInput & LatticeContext>;
};

export const normalizeRoute = (value: string): LatticeRouteId => asRouteId(value.replace(/\\s+/g, '-'));

export const policyScope = <T extends string>(tenant: string, route: T): PolicyRouteMask<T> =>
  `policy::${tenant}:${route}` as PolicyRouteMask<T>;

export const policySignatureFromBlueprint = <
  TBlueprint extends LatticeBlueprintManifest,
>(blueprint: TBlueprint, context: RecursivePath<TBlueprint>): string => {
  return `${String(blueprint.tenantId)}:${context}` as string;
};

export const isRouteAction = (value: string, route: LatticeRouteId): boolean => route.includes(value);

export const sanitizeConstraintPath = <TPath extends string>(value: TPath): TPath =>
  (value.trim().toLowerCase().replace(/[^a-z0-9.]/g, '-') as TPath);
