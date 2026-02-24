import { asRunId, resolvePlanTemplates, type AutomationPlanTemplate, type PlanTemplateInput, type PlanId } from '@shared/automation-orchestration-runtime';
import type { AutomationTenantId } from './types';

export interface RecoveryAutomationCatalogEntry {
  readonly tenant: AutomationTenantId;
  readonly plans: readonly AutomationPlanTemplate[];
  readonly labels: readonly string[];
  readonly revision: string;
}

export interface RecoveryAutomationSeed {
  readonly tenant: string;
  readonly tags: readonly string[];
  readonly customPlanCount: number;
}

const catalogSeeds = [
  {
    tenant: 'global',
    tags: ['default', 'continuity', 'incident'],
    customPlanCount: 1,
  },
  {
    tenant: 'enterprise',
    tags: ['enterprise', 'finance', 'risk'],
    customPlanCount: 3,
  },
  {
    tenant: 'edge',
    tags: ['edge', 'regulatory'],
    customPlanCount: 2,
  },
] as const satisfies readonly RecoveryAutomationSeed[];

const validateSeed = (seed: RecoveryAutomationSeed): void => {
  if (!seed.tenant || seed.tenant.trim().length === 0) {
    throw new Error('seed tenant must be present');
  }
  if (seed.customPlanCount < 0) {
    throw new Error(`invalid customPlanCount ${seed.customPlanCount}`);
  }
};

const tenantFromSeed = (seed: RecoveryAutomationSeed): AutomationTenantId => `tenant:${seed.tenant}` as AutomationTenantId;

const preloadedPlans = new Map<AutomationTenantId, readonly AutomationPlanTemplate[]>();
const templateEntries = catalogSeeds.map((seed) => {
  validateSeed(seed);
  const tenant = tenantFromSeed(seed);
  const templates = resolvePlanTemplates(seed.tenant).map((template) => ({
    ...template,
    id: asRunId(`plan:${template.id}:${seed.tenant}`) as unknown as PlanId,
  }));
  const revision = `rev:${seed.customPlanCount + templates.length}`;
  return {
    tenant,
    plans: templates as readonly AutomationPlanTemplate[],
    labels: [...seed.tags],
    revision,
  };
});
for (const entry of templateEntries) {
  preloadedPlans.set(entry.tenant, entry.plans);
}

const tenantPlans = new Map<AutomationTenantId, RecoveryAutomationCatalogEntry>();
for (const entry of templateEntries) {
  tenantPlans.set(entry.tenant, entry);
}

export const getCatalog = (tenant: AutomationTenantId): RecoveryAutomationCatalogEntry | undefined =>
  tenantPlans.get(tenant);

export const getCatalogPlan = (
  tenant: AutomationTenantId,
  planId: string,
): AutomationPlanTemplate | undefined =>
  tenantPlans
    .get(tenant)
    ?.plans.find((plan) => plan.id === (asRunId(planId) as unknown as PlanId));

export const hasCatalog = (tenant: AutomationTenantId): boolean => tenantPlans.has(tenant);

export const catalogEntries = (): readonly RecoveryAutomationCatalogEntry[] => templateEntries;

export const withDynamicPlan = (planId: string): PlanTemplateInput => ({
  id: asRunId(planId) as unknown as PlanId,
  version: 'v9.9',
  title: `Dynamic ${planId}`,
  namespace: 'ns:dynamic',
  scope: 'scope:runtime',
  stages: [
    {
      name: 'seed',
      description: 'Dynamic stage seed',
      priority: 'medium',
      dependsOn: [],
      tags: ['dynamic'],
    },
    {
      name: 'validate',
      description: 'Dynamic validation and confidence check',
      priority: 'high',
      dependsOn: ['seed'],
      tags: ['dynamic', 'validation'],
    },
  ],
});
