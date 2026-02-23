import type { DrillMetricPoint, DrillRunSnapshot, DrillRunStatus, DrillHealthFrame, DrillWorkspace, DrillRunQuery } from './types';

export type DrillPriorityBand = 'safe' | 'moderate' | 'urgent';

export interface ConstraintWindow {
  readonly key: string;
  readonly startAt: string;
  readonly endAt: string;
}

export interface ConstraintViolation {
  readonly code: string;
  readonly message: string;
  readonly impactedRunId?: string;
}

export const statusToLevel = (status: DrillRunStatus): number => {
  switch (status) {
    case 'queued':
    case 'preparing':
      return 0;
    case 'running':
    case 'paused':
      return 1;
    case 'completed':
      return 2;
    case 'failed':
      return -1;
    default:
      return 0;
  }
};

export const scoreHealthBand = (health: number): DrillPriorityBand => {
  if (health >= 75) return 'safe';
  if (health >= 40) return 'moderate';
  return 'urgent';
};

export const makeWindow = (startAt: string, endAt: string, key: string): ConstraintWindow => ({
  key,
  startAt,
  endAt,
});

export const buildHealthFrames = (snapshot: DrillRunSnapshot): readonly DrillHealthFrame[] => {
  if (!snapshot.steps.length) {
    return [];
  }

  const points = snapshot.steps.length;
  const base = snapshot.updatedAt;
  const completed = snapshot.steps.filter((step) => step.status === 'succeeded').length;
  const warned = snapshot.steps.filter((step) => step.status === 'warning').length;
  const failed = snapshot.steps.filter((step) => step.status === 'failed').length;

  const completionRatio = Math.round((completed / points) * 100);
  const riskRatio = Math.min(100, Math.round(((failed * 20 + warned * 5) / points) * 100 + snapshot.riskBudgetPercent * 100));

  return [
    {
      timestamp: base,
      stage: 'warm',
      completionRatio: Math.max(0, completionRatio - 20),
      riskRatio: Math.max(0, riskRatio - 20),
    },
    {
      timestamp: base,
      stage: 'active',
      completionRatio,
      riskRatio,
    },
    {
      timestamp: base,
      stage: 'cooldown',
      completionRatio: Math.min(100, completionRatio + 20),
      riskRatio: Math.max(0, riskRatio - 5),
    },
  ];
};

export const validateScenario = (
  workspace: DrillWorkspace,
  query: DrillRunQuery,
): readonly ConstraintViolation[] => {
  const violations: ConstraintViolation[] = [];

  if (query.workspaceId && query.workspaceId !== workspace.id) {
    violations.push({
      code: 'WORKSPACE_MISMATCH',
      message: 'query workspaceId does not match provided workspace',
      impactedRunId: `${workspace.id}` as string,
    });
  }

  if (query.from && query.to && query.from > query.to) {
    violations.push({
      code: 'INVALID_TIME_WINDOW',
      message: 'query from date must be <= to date',
    });
  }

  if ((workspace.metadata.tags ?? []).length === 0) {
    violations.push({
      code: 'EMPTY_TAG_SET',
      message: 'workspace should have at least one tag',
      impactedRunId: workspace.id,
    });
  }

  return violations;
};

export const metricTrend = (points: readonly DrillMetricPoint[]): number => {
  if (points.length < 2) {
    return 0;
  }

  const sorted = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const first = sorted[0]?.value ?? 0;
  const last = sorted[sorted.length - 1]?.value ?? 0;

  if (first === 0) {
    return last > 0 ? 1 : 0;
  }

  return (last - first) / first;
};

export const rankByRisk = (frames: readonly DrillHealthFrame[]): readonly DrillHealthFrame[] => {
  return [...frames].sort((a, b) => {
    const riskDelta = a.riskRatio - b.riskRatio;
    return riskDelta !== 0 ? riskDelta : a.completionRatio - b.completionRatio;
  });
};
