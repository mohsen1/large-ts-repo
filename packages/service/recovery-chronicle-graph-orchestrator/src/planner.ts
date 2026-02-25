import {
  buildPlan,
  buildPhases,
  parseMode,
  collectPolicyDigest,
  policyForMode,
  type ChronicleGraphBlueprint,
  type ChronicleGraphPolicy,
  type ChronicleGraphPolicyMode,
  type ChronicleGraphScenario,
  type ChronicleGraphPluginDescriptor,
  type ChronicleGraphTenantId,
  type ChronicleGraphRoute,
} from '@domain/recovery-chronicle-graph-core';
import { type Brand } from '@shared/type-level';

export interface GraphPlanRequest {
  readonly scenario: ChronicleGraphScenario;
  readonly mode: ChronicleGraphPolicyMode;
  readonly plugins: readonly ChronicleGraphPluginDescriptor[];
}

export interface GraphPlanSummary {
  readonly blueprint: ChronicleGraphBlueprint;
  readonly route: ChronicleGraphRoute;
  readonly phases: readonly string[];
  readonly digest: ReturnType<typeof collectPolicyDigest>;
  readonly pluginCount: number;
  readonly concurrency: number;
}

export interface GraphPolicyInput {
  readonly tenant: ChronicleGraphTenantId;
  readonly route: ChronicleGraphRoute;
  readonly mode: ChronicleGraphPolicyMode;
}

export interface GraphPolicySnapshot {
  readonly policy: ChronicleGraphPolicy;
  readonly digest: ReturnType<typeof collectPolicyDigest>;
  readonly budgetMs: number;
  readonly maxParallelism: number;
}

export const createPolicy = (input: GraphPolicyInput): GraphPolicySnapshot => {
  const policy: ChronicleGraphPolicy = {
    mode: input.mode,
    weight: input.route.length,
    route: input.route,
    tenant: input.tenant,
  };

  const profile = policyForMode(input.mode);
  const digest = `${policy.mode}:${policy.weight}:${policy.route}` as Brand<string, 'ChronicleGraphPolicyDigest'>;
  return {
    policy,
    digest,
    budgetMs: profile.latencyBudgetMs,
    maxParallelism: profile.maxParallelism,
  };
};

export const parseModeSafe = (mode: string): ChronicleGraphPolicyMode => parseMode(mode);

export const buildGraphPlan = (input: GraphPlanRequest): GraphPlanSummary => {
  const plan = buildPlan(input.scenario.blueprint, input.mode);
  const policy = createPolicy({
    tenant: input.scenario.tenant,
    route: input.scenario.route,
    mode: input.mode,
  });

  return {
    blueprint: plan.blueprint,
    route: input.scenario.route,
    phases: plan.phases,
    digest: policy.digest,
    pluginCount: input.plugins.length,
    concurrency: policy.maxParallelism,
  };
};

export const normalizeBlueprintNodes = (blueprint: ChronicleGraphBlueprint): ChronicleGraphBlueprint => ({
  ...blueprint,
  nodes: [...blueprint.nodes].toSorted((left, right) => left.name.localeCompare(right.name)),
  edges: [...blueprint.edges].toSorted((left, right) => left.weight - right.weight),
});

export const estimateRunSeconds = (blueprint: ChronicleGraphBlueprint, phases: number): number =>
  Math.max(1, blueprint.nodes.length) * Math.max(1, phases);

export const routeWeight = (route: ChronicleGraphRoute): number => route.length;
