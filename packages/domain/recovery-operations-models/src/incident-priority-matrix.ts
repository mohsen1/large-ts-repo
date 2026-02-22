import type { RecoveryWindow } from '@domain/recovery-orchestration';
import { withBrand } from '@shared/core';
import { buildDeploymentImpactProfile, DeploymentImpactProfile, profileToSummary } from '@domain/recovery-orchestration/deployment-impact';
import type { RunPlanSnapshot, RunSession } from './types';
import { buildCoordinationMetric, TenantCoordinationBoard } from './coordination-metrics';

export type PriorityBand = 'critical' | 'elevated' | 'normal' | 'deferred';

export interface PriorityMatrixCell {
  readonly runId: string;
  readonly bucket: RecoveryWindow['timezone'];
  readonly band: PriorityBand;
  readonly urgencyScore: number;
  readonly blocked: boolean;
}

export interface PriorityMatrix {
  readonly tenant: string;
  readonly cells: readonly PriorityMatrixCell[];
  readonly byBucket: Record<string, readonly string[]>;
}

export interface MatrixSummaryRow {
  readonly band: PriorityBand;
  readonly count: number;
}

const classifyBand = (score: number): PriorityBand => {
  if (score >= 0.8) return 'critical';
  if (score >= 0.5) return 'elevated';
  if (score >= 0.2) return 'normal';
  return 'deferred';
};

export const buildPriorityMatrix = (
  plans: readonly RunPlanSnapshot[],
  tenant: string,
): PriorityMatrix => {
  const cells: PriorityMatrixCell[] = plans.map((plan, index) => {
    const profile: DeploymentImpactProfile = buildDeploymentImpactProfile(plan.program);
    const urgencyScore = profile.confidence * (profile.projectedOutageMinutes / 200);
    const bucket = index % 4 === 0 ? 'UTC' : index % 4 === 1 ? 'LOCAL' : index % 4 === 2 ? 'EST' : 'PST';
    return {
      runId: String(plan.id),
      bucket,
      band: classifyBand(urgencyScore),
      urgencyScore,
      blocked: profile.impactBand === 'severe',
    };
  });

  const byBucket: Record<string, readonly string[]> = {};
  for (const cell of cells) {
    byBucket[cell.bucket] = [...(byBucket[cell.bucket] ?? []), cell.runId];
  }

  return {
    tenant,
    cells,
    byBucket,
  };
};

export const summarizeMatrix = (matrix: PriorityMatrix): MatrixSummaryRow[] => {
  const rows = new Map<PriorityBand, number>();
  for (const cell of matrix.cells) {
    rows.set(cell.band, (rows.get(cell.band) ?? 0) + 1);
  }

  return (['critical', 'elevated', 'normal', 'deferred'] as const).map((band) => ({
    band,
    count: rows.get(band) ?? 0,
  }));
};

export const summarizeProfileRows = (boards: readonly TenantCoordinationBoard[]): readonly string[] => {
  const profileSummaries: string[] = [];
  for (const board of boards) {
    for (const metric of [...board.active, ...board.blocked, ...board.completed]) {
      const profile = buildCoordinationMetric({
        id: metric.runId,
        name: String(metric.runId),
        program: {
          id: withBrand(String(metric.runId), 'RecoveryProgramId'),
          tenant: board.tenant,
          service: withBrand('svc', 'ServiceId'),
          name: 'recovered',
          description: 'generated',
          priority: metric.envelopePriority,
          mode: 'restorative',
          window: {
            startsAt: new Date().toISOString(),
            endsAt: new Date().toISOString(),
            timezone: 'UTC',
          },
          topology: {
            rootServices: ['root'],
            fallbackServices: ['fallback'],
            immutableDependencies: [['root', 'fallback']],
          },
          constraints: [],
          steps: [{
            id: 's0',
            title: 'noop',
            command: 'noop',
            timeoutMs: 1000,
            dependencies: [],
            requiredApprovals: 0,
            tags: [],
          }],
          owner: 'ops',
          tags: ['ops'],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        constraints: {
          maxParallelism: 1,
          maxRetries: 0,
          timeoutMinutes: 10,
          operatorApprovalRequired: false,
        },
        fingerprint: {
          tenant: board.tenant,
          region: 'us-east-1',
          serviceFamily: 'recovery',
          impactClass: 'infrastructure',
          estimatedRecoveryMinutes: metric.estimatedMinutes,
        },
        sourceSessionId: undefined,
        effectiveAt: new Date().toISOString(),
      } as unknown as RunPlanSnapshot, undefined as unknown as RunSession);
      profileSummaries.push(profileToSummary({
        tenant: board.tenant,
        impactBand: metric.impactBand,
        confidence: 0.8,
        projectedOutageMinutes: metric.estimatedMinutes,
        commandCount: metric.laneCoverage,
        laneDistribution: {},
        constraints: ['generated'],
        recommendation: '',
      }));
    }
  }
  return profileSummaries;
}
