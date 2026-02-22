import type { Brand } from '@shared/core';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import { compareProfiles, DeploymentImpactProfile, buildDeploymentImpactProfile, profileToSummary } from '@domain/recovery-orchestration/deployment-impact';
import type { RunPlanSnapshot, RunSession } from './types';

export interface CoordinationMetric {
  readonly runId: RunPlanSnapshot['id'];
  readonly tenant: Brand<string, 'TenantId'>;
  readonly laneCoverage: number;
  readonly envelopePriority: RecoveryProgram['priority'];
  readonly impactBand: DeploymentImpactProfile['impactBand'];
  readonly estimatedMinutes: number;
  readonly summary: string;
}

export interface TenantCoordinationBoard {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly active: readonly CoordinationMetric[];
  readonly completed: readonly CoordinationMetric[];
  readonly blocked: readonly CoordinationMetric[];
  readonly updatedAt: string;
}

const laneCoverageFromProfile = (profile: DeploymentImpactProfile): number => {
  const lanes = Object.keys(profile.laneDistribution).length;
  if (lanes === 0) return 0;
  return Math.round((lanes / Math.max(1, profile.commandCount || 1)) * 100);
};

const bandPriority = (band: DeploymentImpactProfile['impactBand']): number =>
  band === 'minimal' ? 0 : band === 'moderate' ? 1 : band === 'high' ? 2 : 3;

export const buildCoordinationMetric = (
  plan: RunPlanSnapshot,
  session?: RunSession,
): CoordinationMetric => {
  const profile = buildDeploymentImpactProfile(plan.program, session?.runId ? { runId: session.runId, programId: plan.program.id, incidentId: session.id as any, status: 'draft' } as any : undefined);

  return {
    runId: plan.id,
    tenant: session ? session.id as unknown as Brand<string, 'TenantId'> : plan.fingerprint.tenant,
    laneCoverage: laneCoverageFromProfile(profile),
    envelopePriority: plan.program.priority,
    impactBand: profile.impactBand,
    estimatedMinutes: plan.fingerprint.estimatedRecoveryMinutes,
    summary: profileToSummary(profile),
  };
};

export const groupBySessionState = (
  plans: readonly { plan: RunPlanSnapshot; session?: RunSession }[],
): TenantCoordinationBoard => {
  if (plans.length === 0) {
    return {
      tenant: 'unknown' as Brand<string, 'TenantId'>,
      active: [],
      completed: [],
      blocked: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const grouped = plans.map((entry) => buildCoordinationMetric(entry.plan, entry.session));
  const sorted = [...grouped].sort((left, right) => {
    if (left.impactBand !== right.impactBand) {
      return bandPriority(left.impactBand) - bandPriority(right.impactBand);
    }
    return left.estimatedMinutes - right.estimatedMinutes;
  });

  const active: CoordinationMetric[] = [];
  const completed: CoordinationMetric[] = [];
  const blocked: CoordinationMetric[] = [];

  for (const metric of sorted) {
    if (metric.impactBand === 'severe') {
      blocked.push(metric);
      continue;
    }
    if (metric.estimatedMinutes > 60) {
      active.push(metric);
    } else {
      completed.push(metric);
    }
  }

  return {
    tenant: sorted[0]?.tenant ?? ('unknown' as Brand<string, 'TenantId'>),
    active,
    completed,
    blocked,
    updatedAt: new Date().toISOString(),
  };
};

export const summarizeByTenant = (metric: CoordinationMetric): string => {
  return `${metric.runId}|${metric.impactBand}|${metric.envelopePriority}|${metric.summary}`;
};
