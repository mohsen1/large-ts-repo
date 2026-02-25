import { Brand } from '@shared/type-level';
import type {
  QuantumPolicyId,
  QuantumPlan,
  QuantumPlanId,
  QuantumRunbook,
  QuantumSignal,
  QuantumStateKind,
  QuantumStep,
  QuantumTenantId,
  PluginRuntimeFactory,
  RecursivelyBuildTuple,
  QuantumPluginRuntime,
} from './types';
import type { PluginDefinitionMap } from '@shared/recovery-quantum-runtime';
import { rankPolicies, policyTimeline, policyCoverage } from './policy';
import { buildPluginRegistry, pluginPayloadKinds, type QuantumPluginRegistry } from '@shared/recovery-quantum-runtime';

export interface PlannerState {
  readonly tenant: QuantumTenantId;
  readonly version: `v${number}.${number}`;
  readonly planId: QuantumPlanId;
  readonly policyCount: number;
  readonly stepCount: number;
}

type PlannerStepFactory = {
  readonly kind: string;
  readonly command: string;
  readonly latencyMs: number;
};

const planVersion = (tenant: string) => `v${tenant.length % 10}.${tenant.length % 99}` as `v${number}.${number}`;

export type StepTuple = RecursivelyBuildTuple<'step', 4>;

const resolveSignalPath = <const T extends readonly unknown[]>(
  planId: QuantumPlanId,
  path: T,
): `${QuantumPlanId}::${T[number] & string}` =>
  `${planId}::${path.join('.')}` as `${QuantumPlanId}::${T[number] & string}`;

export const createPlannerStep = (planId: QuantumPlanId, index: number, signal: QuantumSignal): QuantumStep => ({
  id: `${planId}:${index}` as Brand<string, 'quantum-step-id'>,
  signalId: signal.id,
  command: `execute-${signal.name}`,
  expectedLatencyMs: Math.max(signal.score * 10, 150),
});

export interface PlanArtifact<TPayload extends object = Record<string, unknown>> {
  readonly id: QuantumPlanId;
  readonly tenant: QuantumTenantId;
  readonly state: QuantumStateKind;
  readonly payloadPath: string;
  readonly tags: readonly string[];
  readonly payload: TPayload;
}

export interface PlannerInputs {
  readonly tenant: QuantumTenantId;
  readonly runbook: QuantumRunbook;
  readonly limit: number;
  readonly state: QuantumStateKind;
}

const createPlanFromSignals = (tenant: QuantumTenantId, runbook: QuantumRunbook, limit: number): QuantumPlan => {
  const pathSeed = resolveSignalPath(`${tenant}:plan` as QuantumPlanId, ['draft', 'signals', 'v1']);
  return {
    id: pathSeed as QuantumPlanId,
    tenant,
    state: 'draft',
    owner: 'quantum-orchestrator',
    steps: runbook.signals.slice(0, limit).map((signal, index) => createPlannerStep(pathSeed as QuantumPlanId, index, signal)),
    labels: runbook.metadata.tags,
    metadata: {
      source: pathSeed,
      policySnapshot: runbook.policies.length.toString(),
      createdBy: 'planner',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
};

class QuantumPlanBuilder {
  readonly #tenant: QuantumTenantId;
  readonly #steps: QuantumStep[] = [];
  readonly #history: string[] = [];
  #state: QuantumStateKind = 'draft';

  constructor(tenant: QuantumTenantId) {
    this.#tenant = tenant;
  }

  setState(state: QuantumStateKind): this {
    this.#state = state;
    return this;
  }

  append(steps: readonly QuantumStep[]): this {
    this.#steps.push(...steps);
    return this;
  }

  stamp(tag: string): this {
    this.#history.push(tag);
    return this;
  }

  build(runbook: QuantumRunbook, index: QuantumPolicyId): QuantumPlan {
    return {
      id: `${this.#tenant}:plan:${index}` as QuantumPlanId,
      tenant: this.#tenant,
      state: this.#state,
      owner: 'planner',
      steps: [...this.#steps],
      labels: [...this.#history, index],
      metadata: {
        stepCount: String(this.#steps.length),
        rankedPolicies: String(rankPolicies(runbook.policies).length),
        coverage: String(policyCoverage(runbook.signals, runbook.policies)),
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

export const createPlanArtifact = ({ tenant, runbook, limit, state }: PlannerInputs): PlanArtifact<QuantumPlan> => {
  const rankedPlanPolicies = rankPolicies(runbook.policies);
  const staged = new QuantumPlanBuilder(tenant)
    .setState(state)
    .stamp(`state:${state}`)
    .stamp(`policy:${rankedPlanPolicies.length}`);

  for (const policy of rankedPlanPolicies) {
    for (const signal of runbook.signals) {
      const steps = policyTimeline(signal, policy);
      staged.append(steps);
    }
  }

  const plan = staged.build(runbook, runbook.policies[0]?.id ?? (`${tenant}:fallback` as QuantumPlanId));
  const enriched: QuantumPlan = {
    ...plan,
    steps: runbook.plans
      .filter((item) => item.id !== plan.id)
      .map((item) => ({
        ...createPlannerStep(item.id, item.steps.length, {
          id: `${item.id}:signal` as QuantumSignal['id'],
          tenant,
          name: item.owner,
          severity: 'info',
          dimension: 'plan',
          score: item.steps.length + 1,
          payload: { source: 'bootstrap' },
          observedAt: item.updatedAt,
        }),
      })),
  };

  return {
    id: enriched.id,
    tenant,
    state: enriched.state,
    payloadPath: `quantum:${tenant}:${enriched.id}`,
    tags: enriched.labels,
    payload: enriched,
  };
};

export const runbookPlan = (tenant: QuantumTenantId, runbook: QuantumRunbook): QuantumPlan => {
  const bootstrap = createPlanFromSignals(tenant, runbook, Math.max(1, runbook.signals.length));
  const plan = {
    ...bootstrap,
    steps: bootstrap.steps.concat(
      policyCoverage(runbook.signals, runbook.policies) > 0.2
        ? [
            ...runbook.plans.flatMap((plan) =>
              plan.steps.map((step) => ({
                ...step,
                id: `${step.id}:coverage` as Brand<string, 'quantum-step-id'>,
                expectedLatencyMs: Math.max(step.expectedLatencyMs * 0.9, 50),
              })),
            ),
          ]
        : [],
    ),
    metadata: {
      ...bootstrap.metadata,
      v: planVersion(String(tenant)),
      coverage: policyCoverage(runbook.signals, runbook.policies).toFixed(3),
    },
  };
  return plan;
};

export const createPlanSummary = (plan: QuantumPlan): { readonly state: QuantumStateKind; readonly steps: number } => ({
  state: plan.state,
  steps: plan.steps.length,
});

export const isPlanReady = (plan: QuantumPlan, targetStepCount: number): boolean => plan.steps.length >= targetStepCount;

export const buildRegistrySummary = (registry: QuantumPluginRegistry<PluginDefinitionMap>) => {
  const kinds = pluginPayloadKinds(registry);
  const summary = kinds.map((kind) => `plugin:${kind}`).join('|');
  return {
    count: kinds.length,
    value: summary,
    generatedAt: new Date().toISOString(),
  };
};

export const createMinimalState = (
  tenant: QuantumTenantId,
): PlannerState => ({
  tenant,
  version: planVersion(String(tenant)),
  planId: `${tenant}:state` as QuantumPlanId,
  policyCount: 0,
  stepCount: 0,
});
