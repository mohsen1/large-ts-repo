import { withBrand } from '@shared/core';
import type {
  DrillMode,
  DrillQuery,
  DrillTemplate,
  DrillTemplateProjection,
  DrillTemplatePlan,
  RecoveryDrillRunId,
  RecoveryDrillTenantId,
} from './types';

export interface CommandMetricInput {
  readonly tenantId: RecoveryDrillTenantId;
  readonly templates: readonly DrillTemplate[];
  readonly filter?: DrillQuery;
  readonly mode: DrillMode;
}

export interface CommandMetricBucket {
  readonly key: string;
  readonly title: string;
  readonly count: number;
  readonly weightedScore: number;
}

export interface CommandMetricReport {
  readonly tenantId: RecoveryDrillTenantId;
  readonly totalTemplates: number;
  readonly mode: DrillMode;
  readonly buckets: readonly CommandMetricBucket[];
  readonly top: readonly DrillTemplateProjection[];
  readonly plan: DrillTemplatePlan | undefined;
}

export interface CommandTrend {
  readonly bucket: string;
  readonly movement: 'increase' | 'decrease' | 'steady';
  readonly delta: number;
}

const toProjection = (template: DrillTemplate): DrillTemplateProjection => ({
  id: template.id,
  tenantId: template.tenantId,
  priority: template.priority,
  scenarioCount: template.scenarios.length,
  window: template.window,
});

const bucketKey = (template: DrillTemplate): string => `${template.mode}:${template.priority}`;

const weightedByMode = (mode: DrillMode): number => {
  switch (mode) {
    case 'game-day':
      return 1.3;
    case 'automated-chaos':
      return 1.5;
    case 'customer-sim':
      return 1.1;
    case 'tabletop':
    default:
      return 0.8;
  }
};

const scoreTemplate = (template: DrillTemplate, mode: DrillMode): number => {
  const scenarioPenalty = template.scenarios.reduce(
    (acc, scenario) =>
      acc + scenario.steps.reduce((sum, step) => sum + (step.requiredApprovals ?? 0), 0),
    0,
  );
  return template.scenarios.length * weightedByMode(mode) + template.defaultApprovals + scenarioPenalty;
};

const buildPlan = (templates: readonly DrillTemplate[]): DrillTemplatePlan | undefined => {
  const top = templates[0];
  if (!top) return undefined;
  return {
    template: top,
    context: {
      runId: withBrand(`${top.id}-${Math.floor(Date.now() / 1000)}`, 'RecoveryDrillRunId') as RecoveryDrillRunId,
      templateId: top.id,
      runAt: new Date().toISOString(),
      initiatedBy: top.createdBy,
      mode: top.mode,
      approvals: top.defaultApprovals,
    },
    scenarioOrder: top.scenarios.map((scenario) => scenario.id),
    envelope: {
      source: 'recovery-drill',
      sequence: top.scenarios.map((item) => item.id),
      issuedAt: new Date().toISOString(),
      checks: [],
    },
  };
};

export const buildCommandBuckets = (input: CommandMetricInput): CommandMetricReport => {
  const filtered = input.templates.filter((template) => {
    if (input.filter?.tenant && template.tenantId !== input.filter.tenant) return false;
    if (input.filter?.mode && template.mode !== input.filter.mode) return false;
    if (input.filter?.priority && template.priority !== input.filter.priority) return false;
    return true;
  });

  const buckets = new Map<string, CommandMetricBucket>();
  for (const template of filtered) {
    const key = bucketKey(template);
    const prior = buckets.get(key) ?? {
      key,
      title: `${template.mode}/${template.priority}`,
      count: 0,
      weightedScore: 0,
    };
    const next = {
      ...prior,
      count: prior.count + 1,
      weightedScore: Number((prior.weightedScore + scoreTemplate(template, input.mode)).toFixed(2)),
    };
    buckets.set(key, next);
  }

  const bucketList = Array.from(buckets.values()).sort((left, right) => right.weightedScore - left.weightedScore);
  const top = filtered
    .map((template) => toProjection(template))
    .sort((left, right) => right.scenarioCount - left.scenarioCount)
    .slice(0, 5);

  return {
    tenantId: input.tenantId,
    totalTemplates: filtered.length,
    mode: input.mode,
    buckets: bucketList,
    top,
    plan: buildPlan(filtered),
  };
};

export const computeTrend = (previous: CommandMetricReport, next: CommandMetricReport): readonly CommandTrend[] => {
  return next.buckets.map((bucket) => {
    const prev = previous.buckets.find((candidate) => candidate.key === bucket.key)?.count ?? 0;
    const delta = bucket.count - prev;
    return {
      bucket: bucket.key,
      movement: delta > 0 ? 'increase' : delta < 0 ? 'decrease' : 'steady',
      delta,
    };
  });
};

export const buildTenantSignal = (metrics: readonly CommandMetricReport[]): ReadonlyMap<string, number> => {
  const signalMap = new Map<string, number>();
  for (const metric of metrics) {
    const score = metric.buckets.reduce((acc, bucket) => acc + bucket.weightedScore, 0);
    signalMap.set(metric.tenantId, Number(score.toFixed(2)));
  }
  return signalMap;
};
