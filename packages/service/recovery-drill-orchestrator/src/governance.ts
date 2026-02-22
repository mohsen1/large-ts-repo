import type { DrillDependencies, DrillCatalogFilter } from './types';
import {
  evaluatePolicyDecision,
  summarizePolicyDecisions,
  type DrillPolicyDecision,
  parsePolicyRule,
} from '@domain/recovery-drill/src/policy';
import { selectCandidates } from '@domain/recovery-drill/src/selection';
import type { CandidateInput } from '@domain/recovery-drill/src/selection';
import { computeTemplateRiskProfile } from '@domain/recovery-drill/src/risk';
import type { DrillRunRecord, DrillTemplateRecord } from '@data/recovery-drill-store/src';
import { createStartInput, toStoreQuery } from './adapters';
import { withBrand } from '@shared/core';

export interface DrillGovernanceSummary {
  readonly tenant: string;
  readonly decisions: readonly DrillPolicyDecision[];
  readonly metrics: ReturnType<typeof summarizePolicyDecisions>;
}

const defaultPolicyRule = parsePolicyRule({
  templateId: withBrand('global-policy', 'RecoveryDrillTemplateId'),
  tenantId: withBrand('global', 'TenantId'),
  enabled: true,
  allowMode: ['tabletop', 'game-day', 'automated-chaos', 'customer-sim'],
  maxOpenRuns: 6,
  minScore: 10,
  maxPriority: 'critical',
  allowedImpacts: ['low', 'medium', 'high', 'critical'],
});

export const buildPolicyDecisions = async (
  dependencies: Pick<DrillDependencies, 'templates' | 'runs'>,
  filter: DrillCatalogFilter,
): Promise<DrillGovernanceSummary> => {
  const templates = await dependencies.templates.listTemplates(filter.tenant);
  const query = toStoreQuery(filter);
  const runResult = await dependencies.runs.listRuns(query);

  const openRunCount = runResult.items.filter((item) => item.status === 'running' || item.status === 'queued').length;
  const tenantLoad = query.tenant ? Math.min(1, openRunCount / 10) : 0;

  const decisions = templates.map((templateRecord) => {
    const riskProfile = computeTemplateRiskProfile(templateRecord.template);
    const candidates = selectCandidates(
      [{ template: templateRecord.template, tenantId: templateRecord.tenantId } as CandidateInput],
      { minScore: defaultPolicyRule.minScore, tenantId: query.tenant, allowedModes: undefined },
    );
    const topScore = candidates[0]?.score ?? riskProfile.riskScore;

    return evaluatePolicyDecision(
      {
        tenantId: templateRecord.tenantId,
        template: templateRecord.template,
        topScore,
        openRunCount,
        tenantLoad,
      },
      defaultPolicyRule,
    );
  });

  return {
    tenant: filter.tenant,
    decisions,
    metrics: summarizePolicyDecisions(decisions),
  };
};

export const buildRunTemplateHints = (
  runs: readonly DrillRunRecord[],
  templates: readonly DrillTemplateRecord[],
): ReadonlyMap<string, { latestMode: string; total: number; failed: number }> => {
  const map = new Map<string, { latestMode: string; total: number; failed: number }>();
  for (const template of templates) {
    const history = runs.filter((run) => run.templateId === template.templateId);
    const latestMode = history.at(-1)?.mode ?? 'tabletop';
    map.set(template.templateId, {
      latestMode,
      total: history.length,
      failed: history.filter((run) => run.status === 'failed').length,
    });
  }
  return map;
};

export const toGovernanceStartInput = (
  templateId: string,
  tenant: string,
  input: { initiatedBy: string; mode?: string },
): ReturnType<typeof createStartInput> => createStartInput(templateId, input.initiatedBy, input.mode as never, new Date().toISOString());
