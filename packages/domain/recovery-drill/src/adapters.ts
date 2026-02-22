import type { DrillTemplate } from './types';
import { parseDrillQuery, parseDrillTemplate } from './schema';
import { selectCandidates } from './selection';
import { computeTemplateRiskProfile } from './risk';
import type { CandidateInput } from './selection';
import { withBrand } from '@shared/core';
import type { DrillExecutionProfile, DrillStatus, RecoveryDrillTenantId } from './types';

export interface ParsedRunInput {
  readonly tenant: RecoveryDrillTenantId;
  readonly queryMode?: string;
  readonly projection: readonly {
    readonly id: string;
    readonly tenantId: RecoveryDrillTenantId;
    readonly scenarioCount: number;
    readonly priority: string;
    readonly window: { startAt: string; endAt: string; timezone: string };
  }[];
}

export interface TemplateProjection {
  readonly id: string;
  readonly tenantId: RecoveryDrillTenantId;
  readonly scenarioCount: number;
  readonly priority: string;
  readonly window: { readonly startAt: string; readonly endAt: string; readonly timezone: string };
}

export const parseCatalogEnvelope = (value: unknown): ParsedRunInput => {
  const query = parseDrillQuery(typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined);
  return {
    tenant: query.tenant ? withBrand(String(query.tenant), 'TenantId') : withBrand('global', 'TenantId'),
    queryMode: query.mode,
    projection: [],
  };
};

export interface RunBundleProfile {
  readonly total: number;
  readonly active: number;
  readonly successRate: number;
}

export interface RunBundle {
  readonly ids: readonly string[];
  readonly active: number;
  readonly successRate: number;
}

export const buildTemplateProjection = (template: DrillTemplate): TemplateProjection => ({
  id: template.id,
  tenantId: template.tenantId,
  scenarioCount: template.scenarios.length,
  priority: template.priority,
  window: template.window,
});

export interface TemplateSelectionInput {
  readonly tenantId: RecoveryDrillTenantId;
  readonly templates: readonly DrillTemplate[];
  readonly minScore: number;
}

export const buildCatalogSummary = (input: TemplateSelectionInput) => {
  const candidates = selectCandidates(
    input.templates.map((template) => ({ template, tenantId: input.tenantId }) as CandidateInput),
    {
      minScore: input.minScore,
      tenantId: input.tenantId,
      allowedModes: undefined,
    },
  );

  const selected = candidates
    .map((candidate) => {
      const template = input.templates.find((entry) => entry.id === candidate.templateId);
      if (!template) {
        throw new Error('candidate-template-missing');
      }
      return {
        candidate,
        projection: buildTemplateProjection(template),
      };
    })
    .sort((left, right) => right.candidate.score - left.candidate.score)
    .map((entry) => entry.projection);

  const topRisk = selected.reduce((acc, item) => {
    const template = input.templates.find((entry) => entry.id === item.id);
    if (!template) return acc;
    return Math.max(acc, computeTemplateRiskProfile(template).riskScore);
  }, 0);

  return {
    templates: selected,
    selectedCount: selected.length,
    topRisk,
  };
};

export const parseTemplate = (value: unknown): DrillTemplate => parseDrillTemplate(value);

export const summarizeTemplates = (templates: readonly DrillTemplate[]) =>
  templates.map((template) => ({ template: template.id, scenarios: template.scenarios.length, tenant: template.tenantId }));

const isActiveRun = (run: { readonly status: DrillStatus }): boolean =>
  run.status === 'queued' || run.status === 'running' || run.status === 'paused';

export const createRunBundle = (
  runs: readonly { readonly id: string; readonly status: DrillStatus; readonly profile: DrillExecutionProfile }[],
): RunBundle => {
  const total = runs.length;
  const active = runs.filter(isActiveRun).length;
  const successRate =
    total === 0 ? 0 : Number((runs.reduce((sum, run) => run.profile.successRate + sum, 0) / total).toFixed(4));
  return {
    ids: runs.map((run) => run.id),
    active,
    successRate,
  };
};

export const buildRunBundle = (
  runs: readonly { readonly id: string; readonly status: DrillStatus; readonly profile: DrillExecutionProfile }[],
): RunBundle => createRunBundle(runs);
