import { withBrand } from '@shared/core';
import type { RunAssessment, BatchReadinessAssessment } from '@domain/recovery-operations-intelligence';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { IntelligenceRepository } from '@data/recovery-operations-intelligence-store';
import { ok, fail, type Result } from '@shared/result';

export interface IntelligenceCoordinatorArtifacts {
  readonly snapshots: readonly { runId: RecoveryRunState['runId']; snapshotId: string }[];
  readonly assessments: readonly RunAssessment[];
}

export const buildAssessmentArtifacts = (
  assessments: readonly RunAssessment[],
): IntelligenceCoordinatorArtifacts => {
  const byRun = new Map<string, RunAssessment[]>();

  for (const assessment of assessments) {
    const bucket = byRun.get(assessment.runId) ?? [];
    bucket.push(assessment);
    byRun.set(assessment.runId, bucket);
  }

  const snapshots = Array.from(byRun.entries()).map(([runId, entries]) => ({
    runId,
    snapshotId: `snapshot-${runId}-${entries.length}`,
  }));

  return {
    snapshots,
    assessments,
  };
};

export const publishBatchSnapshot = async (
  batch: BatchReadinessAssessment,
  repository: IntelligenceRepository,
): Promise<Result<void, string>> => {
  try {
    await repository.saveBatchAssessment(withBrand(batch.cohort[0]?.tenant ?? 'tenant', 'TenantId'), batch);
    return ok(undefined);
  } catch (error) {
    return fail((error as Error).message ?? 'BATCH_STORE_FAILED');
  }
};

export const replayRunSessions = async (
  repository: RecoveryOperationsRepository,
): Promise<Result<number, string>> => {
  const snapshot = await repository.loadLatestSnapshot('tenant');
  if (!snapshot) {
    return fail('NO_SESSION_SNAPSHOT');
  }

  return ok(snapshot.sessions.length);
};
