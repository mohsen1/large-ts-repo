import { Brand, withBrand } from '@shared/core';
import { createValidator, brandFrom } from '@shared/validation';
import { z } from 'zod';
import {
  type ConvergenceConstraint,
  type ConvergenceConstraintId,
  type ConvergenceScope,
  createConstraintId,
} from './types';

const scopeValues = ['tenant', 'topology', 'signal', 'policy', 'fleet'] as const satisfies readonly ConvergenceScope[];

const rawConstraintSchema = z.object({
  scope: z.enum(scopeValues),
  key: z.string().min(2),
  weight: z.number().finite().min(0).max(1),
  active: z.boolean(),
});

const scenarioSchema = z.object({
  templateId: z.string().uuid(),
  tenantId: z.string().min(3),
  name: z.string().min(2),
  scope: z.enum(scopeValues),
  horizonMinutes: z.number().int().positive(),
  constraints: z.array(rawConstraintSchema).min(1),
});

type ScenarioTemplateSeed = z.input<typeof scenarioSchema>;
type ScenarioSeedConstraint = z.input<typeof rawConstraintSchema>;

const scenarioTemplateValidator = createValidator(scenarioSchema);
const constraintValidator = createValidator(rawConstraintSchema);

export interface ScenarioTemplate {
  readonly templateId: string;
  readonly tenantId: string;
  readonly name: string;
  readonly scope: ConvergenceScope;
  readonly horizonMinutes: number;
  readonly constraints: readonly ConvergenceConstraint[];
}

export interface ScenarioEnvelope {
  readonly templateId: string;
  readonly tenantId: string;
  readonly label: string;
  readonly score: number;
}

const rawTemplates = [
  {
    templateId: '11111111-1111-4111-8111-111111111111',
    tenantId: 'tenant:recovery-lab-orchestration',
    name: 'baseline-stability',
    scope: 'tenant',
    horizonMinutes: 12,
    constraints: [
      { scope: 'tenant', key: 'criticality', weight: 0.5, active: true },
      { scope: 'signal', key: 'latency', weight: 0.75, active: true },
    ],
  },
  {
    templateId: '22222222-2222-4222-8222-222222222222',
    tenantId: 'tenant:recovery-lab-orchestration',
    name: 'topology-guard',
    scope: 'topology',
    horizonMinutes: 24,
    constraints: [
      { scope: 'topology', key: 'coupling', weight: 0.65, active: true },
      { scope: 'policy', key: 'isolation', weight: 0.42, active: true },
    ],
  },
  {
    templateId: '33333333-3333-4333-8333-333333333333',
    tenantId: 'tenant:recovery-lab-orchestration',
    name: 'policy-safety',
    scope: 'policy',
    horizonMinutes: 60,
    constraints: [
      { scope: 'policy', key: 'drain-rate', weight: 0.91, active: true },
      { scope: 'fleet', key: 'owner', weight: 0.33, active: false },
    ],
  },
  {
    templateId: '44444444-4444-4444-8444-444444444444',
    tenantId: 'tenant:recovery-lab-orchestration',
    name: 'signal-drill',
    scope: 'signal',
    horizonMinutes: 90,
    constraints: [
      { scope: 'signal', key: 'degradation', weight: 0.44, active: true },
      { scope: 'signal', key: 'incident-density', weight: 0.2, active: true },
    ],
  },
  {
    templateId: '55555555-5555-4555-8555-555555555555',
    tenantId: 'tenant:recovery-lab-orchestration',
    name: 'fleet-integrity',
    scope: 'fleet',
    horizonMinutes: 30,
    constraints: [
      { scope: 'fleet', key: 'owner', weight: 0.55, active: true },
      { scope: 'tenant', key: 'quota', weight: 0.18, active: false },
    ],
  },
] as const;

const enrichConstraint = (value: ScenarioSeedConstraint): ConvergenceConstraint => {
  const parsed = constraintValidator.parse(value);
  if (!parsed.ok) {
    throw new Error(parsed.error.message);
  }
  return {
    ...parsed.value,
    id: createConstraintId(parsed.value.scope, parsed.value.key),
    weight: parsed.value.weight,
  };
};

const enrichTemplate = (seed: ScenarioTemplateSeed): ScenarioTemplate => ({
  templateId: seed.templateId,
  tenantId: seed.tenantId,
  name: seed.name,
  scope: seed.scope,
  horizonMinutes: seed.horizonMinutes,
  constraints: seed.constraints.map(enrichConstraint),
});

export const scenarioBlueprints: readonly ScenarioTemplate[] = rawTemplates
  .map((seed) => {
    const parsed = scenarioTemplateValidator.parse(seed);
    if (!parsed.ok) {
      void parsed;
      return null;
    }
    return enrichTemplate(parsed.value);
  })
  .filter((entry): entry is ScenarioTemplate => entry !== null)
  .toSorted((left, right) => (left.scope.localeCompare(right.scope) || left.name.localeCompare(right.name)));

export const normalizeScenarioTemplate = (value: unknown): ScenarioTemplate | null => {
  const parsed = scenarioTemplateValidator.parse(value);
  if (!parsed.ok) {
    return null;
  }
  return enrichTemplate(parsed.value);
};

export type ScenarioTemplateId = Brand<string, 'ScenarioTemplateId'>;

export const buildScenarioTemplateId = (templateId: string): ScenarioTemplateId =>
  withBrand(templateId, 'ScenarioTemplateId');

export const templateIds = scenarioBlueprints.map((template) => buildScenarioTemplateId(template.templateId));

export const templateIdList = {
  count: templateIds.length,
  ids: [...templateIds],
};

export const templateManifest = (templates: readonly ScenarioTemplate[] = scenarioBlueprints): ScenarioEnvelope[] => {
  return templates.toSorted((left, right) => left.name.localeCompare(right.name)).map((template) => ({
    templateId: template.templateId,
    tenantId: template.tenantId,
    label: `${template.scope}:${template.name}`,
    score: template.horizonMinutes / Math.max(1, template.constraints.length),
  }));
};

const templateBrand = brandFrom(z.string(), `ScenarioTemplate`);

export const validateTemplateId = (value: unknown): value is ScenarioTemplateId => {
  const parsed = templateBrand.parse(value);
  return parsed.ok;
};
