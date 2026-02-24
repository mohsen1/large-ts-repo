import type { Brand } from '@shared/type-level';
import { toStage, type StageDefinition, type StageName } from './contract';

export type PlanId = Brand<string, 'PlanId'>;
export type PlanVersion = `v${number}.${number}`;

export interface PlanTemplateInput {
  readonly id: PlanId;
  readonly version: PlanVersion;
  readonly title: string;
  readonly namespace: string;
  readonly scope: string;
  readonly stages: readonly StageTemplateInput[];
}

export interface StageTemplateInput {
  readonly name: string;
  readonly description: string;
  readonly priority: 'critical' | 'high' | 'medium' | 'low' | 'background';
  readonly dependsOn: readonly string[];
  readonly tags: readonly string[];
}

export interface AutomationPlanTemplate {
  readonly id: PlanId;
  readonly version: PlanVersion;
  readonly title: string;
  readonly namespace: string;
  readonly scope: string;
  readonly stages: readonly StageDefinition[];
}

const seedCatalog = [
  {
    id: 'plan:continuity-cockpit' as PlanId,
    version: 'v1.1' as PlanVersion,
    title: 'Continuity Cockpit Automation',
    namespace: 'ns:recovery.continuity',
    scope: 'scope:continuous',
    stages: [
      {
        name: 'snapshot',
        description: 'Capture latest risk posture and readiness signals',
        priority: 'high',
        dependsOn: [],
        tags: ['observability', 'risk'],
      },
      {
        name: 'telemetry',
        description: 'Aggregate telemetry and identify drift',
        priority: 'high',
        dependsOn: ['snapshot'],
        tags: ['telemetry', 'correlation'],
      },
      {
        name: 'policy',
        description: 'Apply policy gate and approval simulation',
        priority: 'medium',
        dependsOn: ['telemetry'],
        tags: ['policy', 'approval'],
      },
      {
        name: 'simulation',
        description: 'Run deterministic rehearsal with fallback policies',
        priority: 'medium',
        dependsOn: ['policy'],
        tags: ['simulation', 'planner'],
      },
      {
        name: 'execution',
        description: 'Execute resilient command sequence',
        priority: 'critical',
        dependsOn: ['simulation'],
        tags: ['execution', 'drill'],
      },
    ],
  },
  {
    id: 'plan:incident-lifecycle' as PlanId,
    version: 'v2.0' as PlanVersion,
    title: 'Incident Lifecycle Orchestrator',
    namespace: 'ns:recovery.incident',
    scope: 'scope:live',
    stages: [
      {
        name: 'intake',
        description: 'Validate intake signal quality and confidence',
        priority: 'critical',
        dependsOn: [],
        tags: ['intake', 'triage'],
      },
      {
        name: 'enrichment',
        description: 'Enrich events with tenant context and blast radius',
        priority: 'critical',
        dependsOn: ['intake'],
        tags: ['enrichment', 'blast-radius'],
      },
      {
        name: 'assessment',
        description: 'Compose risk assessment matrix for automated next-actions',
        priority: 'medium',
        dependsOn: ['enrichment'],
        tags: ['risk', 'matrix'],
      },
      {
        name: 'response',
        description: 'Dispatch recovery response with safeguards',
        priority: 'high',
        dependsOn: ['assessment'],
        tags: ['response', 'safeguard'],
      },
    ],
  },
] as const;

const hydrate = (input: PlanTemplateInput): AutomationPlanTemplate => ({
  id: input.id,
  version: input.version,
  title: input.title,
  namespace: input.namespace,
  scope: input.scope,
  stages: input.stages.map((stage) => ({
    name: toStage(stage.name),
    namespace: `namespace:${input.namespace}` as `namespace:${string}`,
    description: stage.description,
    dependencies: stage.dependsOn.map(toStage),
    tags: stage.tags.map((tag) => `tag:${tag}` as const),
    priority: stage.priority,
    run: async ({ payload, context }) => ({
      status: 'ok',
      output: payload,
      metrics: [],
      durationMs: 0,
      timestamp: new Date().toISOString(),
      channel: `channel:${context.namespace}` as `channel:${string}`,
    }),
  })),
});

const templateCatalog = seedCatalog.map(hydrate);

export const resolvePlanTemplates = (tenant: string): readonly AutomationPlanTemplate[] => {
  return templateCatalog.map((plan) => ({
    ...plan,
    id: `${plan.id}:${tenant}` as PlanId,
    scope: `scope:${tenant}`,
  }));
};

export const hasTemplate = (templates: readonly AutomationPlanTemplate[], templateId: string): boolean =>
  templates.some((template) => template.id === templateId);

export const getTemplate = (
  templates: readonly AutomationPlanTemplate[],
  templateId: string,
): AutomationPlanTemplate | undefined => templates.find((template) => template.id === templateId);

export const runTemplatePlan = (templates: readonly AutomationPlanTemplate[], templateId: string): readonly StageDefinition[] => {
  const template = getTemplate(templates, templateId);
  if (!template) {
    throw new Error(`Unable to locate template ${templateId}`);
  }
  return template.stages;
};

export const collectStageNames = (definitions: readonly StageDefinition[]): readonly StageName[] =>
  definitions.map((definition) => definition.name);

export const normalizeTemplateVersion = (value: string): PlanVersion => value as PlanVersion;
