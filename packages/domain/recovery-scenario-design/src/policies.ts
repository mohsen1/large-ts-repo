import { Brand } from '@shared/type-level';
import { StageKind } from './topology';
import {
  IdentityRecord,
  OrchestrationRunContext,
  StageResult,
  StageTemplate,
} from './orchestrations';

export type PolicyVerb = 'allow' | 'warn' | 'block' | 'require';
export type PolicySurface = 'safety' | 'cost' | 'latency' | 'resilience' | 'compliance';
export type PolicyScope = 'global' | 'scenario' | 'stage';

export type PolicyCode<TVerb extends PolicyVerb> = `${TVerb}:${string}` & Brand<string, 'PolicyCode'>;

export interface PolicyDefinition<TContext> {
  readonly code: PolicyCode<PolicyVerb>;
  readonly surface: PolicySurface;
  readonly verb: PolicyVerb;
  readonly scope: PolicyScope;
  readonly labels: readonly IdentityRecord<string>[];
  readonly guard: (context: OrchestrationRunContext<TContext>) => Promise<boolean>;
}

export type GateStatus<T extends PolicyVerb> = T extends 'allow'
  ? { status: 'ok'; reason?: string }
  : T extends 'warn'
    ? { status: 'warn'; reason: string }
    : T extends 'require'
      ? { status: 'required'; reason: string }
      : { status: 'blocked'; reason: string };

export type GuardResult<TVerb extends PolicyVerb> =
  | GateStatus<TVerb>
  | { status: 'defer'; reason: string; until: number };

export interface PolicyRule<TContext, TVerb extends PolicyVerb = PolicyVerb> {
  readonly id: PolicyCode<TVerb>;
  readonly surface: PolicySurface;
  readonly verb: TVerb;
  readonly scope: PolicyScope;
  readonly stageKinds: readonly StageKind[];
  readonly severity: 0 | 1 | 2 | 3 | 4 | 5;
  readonly active: boolean;
  readonly labels: readonly IdentityRecord<string>[];
  readonly evaluate: (context: OrchestrationRunContext<TContext>) => Promise<GuardResult<TVerb>>;
}

export type PolicyMap<T extends Record<string, unknown>> = {
  [K in keyof T as `${K & string}Policy`]: T[K];
};

export type PolicyBySurface<
  TContext,
  TPolicy extends readonly PolicyRule<TContext, PolicyVerb>[],
> = {
  [key in PolicySurface]: TPolicy;
};

export interface PolicyManifest<TContext> {
  readonly policySet: IdentityRecord<'policy-manifest'>;
  readonly generatedAt: number;
  readonly scenario: string;
  readonly rules: readonly PolicyRule<TContext>[];
}

const policyPriority = {
  allow: 0,
  warn: 1,
  require: 2,
  block: 3,
} as const satisfies Record<PolicyVerb, number>;

export function sortPolicies<T extends readonly PolicyRule<any>[]>(policies: T): T {
  return ([...policies].sort(
    (a, b) => policyPriority[a.verb as PolicyVerb] - policyPriority[b.verb as PolicyVerb],
  ) as unknown) as T;
}

export function applyPolicySet<TContext>(
  manifest: PolicyManifest<TContext>,
  context: OrchestrationRunContext<TContext>,
): readonly PolicyRule<TContext>[] {
  const rules = manifest.rules.filter(
    (rule): rule is PolicyRule<TContext> => rule.surface === 'safety' && rule.active,
  );
  return context.output === undefined ? rules : rules;
}

export async function evaluatePolicies<TContext>(
  manifest: PolicyManifest<TContext>,
  context: OrchestrationRunContext<TContext>,
): Promise<{
  readonly manifest: PolicyManifest<TContext>['policySet'];
  readonly outcomes: readonly GuardResult<PolicyVerb>[];
}> {
  const outcomes = await Promise.all(manifest.rules.map((rule) => rule.evaluate(context))) as readonly GuardResult<PolicyVerb>[];
  return { manifest: manifest.policySet, outcomes };
}

export function policyGate<TVerb extends PolicyVerb>(
  verb: TVerb,
): (context: OrchestrationRunContext<unknown>, threshold: number) => Promise<GateStatus<TVerb>> {
  return async () => {
    const status = verb === 'block' ? 'blocked' : verb === 'require' ? 'required' : verb === 'warn' ? 'warn' : 'ok';
    return {
      status,
      reason: `policy ${verb} gate`,
    } as GateStatus<TVerb>;
  };
}

export function makePolicyRecord<T extends Record<string, PolicyRule<unknown>>>(input: T): PolicyMap<T> {
  return Object.fromEntries(
    Object.entries(input).map(([k, value]) => [`${k}Policy`, value]),
  ) as PolicyMap<T>;
}

export class PolicyRegistry<TContext> {
  readonly #rules = new Map<string, PolicyRule<TContext>>();

  constructor(rules: readonly PolicyRule<TContext>[]) {
    for (const rule of rules) {
      this.#rules.set(rule.id, rule);
    }
  }

  get(id: string): PolicyRule<TContext> | undefined {
    return this.#rules.get(id);
  }

  add(rule: PolicyRule<TContext>): void {
    this.#rules.set(rule.id, rule);
  }

  list(): readonly PolicyRule<TContext>[] {
    return [...this.#rules.values()];
  }

  [Symbol.iterator](): IterableIterator<PolicyRule<TContext>> {
    return this.#rules.values();
  }
}

export function policyIterator<TContext>(rules: readonly PolicyRule<TContext>[]): Iterable<PolicyRule<TContext>> {
  function* inner(): Generator<PolicyRule<TContext>> {
    for (const rule of rules) {
      yield rule;
    }
  }
  return inner();
}

export type StagePolicyMatrix<T extends readonly StageTemplate<unknown, unknown, unknown>[]> = {
  [K in T[number]['kind']]?: readonly PolicyRule<any, PolicyVerb>[];
};

export function emptyPolicyMatrix<T extends readonly StageTemplate<unknown, unknown, unknown>[]>(
  _templates: T,
): StagePolicyMatrix<T> {
  return {} as StagePolicyMatrix<T>;
}

export function assignPolicies<
  T extends readonly StageTemplate<unknown, unknown, unknown>[],
  TPolicy extends Record<string, readonly PolicyRule<any, PolicyVerb>[]>,
>(
  _stages: T,
  policies: TPolicy,
): StagePolicyMatrix<T> {
  const matrix = {} as StagePolicyMatrix<T>;
  for (const [kind, items] of Object.entries(policies) as Array<[string, readonly PolicyRule<any, PolicyVerb>[]]>) {
    (matrix as Record<string, readonly PolicyRule<any, PolicyVerb>[]>)[kind] = items;
  }
  return matrix;
}

export type EnforcementResult<T extends readonly PolicyRule<any, PolicyVerb>[]> = {
  readonly allowed: boolean;
  readonly rules: {
    readonly [K in keyof T]: T[K] extends PolicyRule<any, infer TVerb> ? GuardResult<TVerb> : GuardResult<PolicyVerb>;
  };
};

export const policyRuntime = {
  evaluate: async <TContext, TPolicy extends readonly PolicyRule<TContext, PolicyVerb>[]>(
    context: OrchestrationRunContext<TContext>,
    policyRules: TPolicy,
  ): Promise<EnforcementResult<TPolicy>> => {
    const outcomes = await Promise.all(policyRules.map((rule) => rule.evaluate(context))) as {
      [K in keyof TPolicy]: TPolicy[K] extends PolicyRule<any, infer TVerb>
        ? GuardResult<TVerb>
        : GuardResult<PolicyVerb>;
    };
    return {
      allowed: outcomes.every((result) => result.status !== 'blocked'),
      rules: outcomes,
    };
  },
};

export type PolicyAdapter<TContext> = (
  context: OrchestrationRunContext<TContext>,
) => Promise<StageResult<TContext>>;

export function inferPolicySurface<T extends PolicySurface>(surface: T): T {
  return surface;
}

export const policyCatalog = {
  allow: {
    verb: 'allow' as const,
    scope: 'global' as const,
    severity: 0,
    surface: 'safety' as const,
  },
  block: {
    verb: 'block' as const,
    scope: 'scenario' as const,
    severity: 5,
    surface: 'compliance' as const,
  },
} as const satisfies Record<string, { verb: PolicyVerb; scope: PolicyScope; severity: number; surface: PolicySurface }>;

export function groupBySurface<TContext>(
  manifest: PolicyManifest<TContext>,
): {
  readonly bySurface: {
    readonly [key in PolicySurface]: readonly PolicyRule<TContext>[];
  };
} {
  return {
    bySurface: {
      safety: manifest.rules.filter((entry) => entry.surface === 'safety'),
      cost: manifest.rules.filter((entry) => entry.surface === 'cost'),
      latency: manifest.rules.filter((entry) => entry.surface === 'latency'),
      resilience: manifest.rules.filter((entry) => entry.surface === 'resilience'),
      compliance: manifest.rules.filter((entry) => entry.surface === 'compliance'),
    },
  };
}

export const policyTemplates = {
  all: ['allow', 'warn', 'require', 'block'] as const,
} as const;

export type PolicyTemplateVerb = (typeof policyTemplates.all)[number];

export interface PolicyAdapterResult<T> {
  readonly adapterKind: PolicyVerb;
  readonly execute: PolicyAdapter<T>;
}

export function buildPolicyAdapters<TInput, TOutput>(
  _stage: StageTemplate<TInput, TInput, TOutput>,
  rule: PolicyRule<TInput, PolicyVerb>,
): PolicyAdapterResult<TInput> {
  return {
    adapterKind: rule.verb,
    execute: async () => ({ status: 'ok', output: ({} as TInput) }),
  };
}
