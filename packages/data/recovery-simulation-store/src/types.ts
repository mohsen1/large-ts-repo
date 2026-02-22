import type {
  SimulationCommand,
  SimulationPlanManifest,
  SimulationRunId,
  SimulationRunRecord,
  SimulationScenarioId,
} from '@domain/recovery-simulation-core';
import type { Brand } from '@shared/core';

export type SimulationStoreSnapshotId = Brand<string, 'SimulationStoreSnapshotId'>;

export interface SimulationArtifactEnvelope {
  readonly snapshotId: SimulationStoreSnapshotId;
  readonly runId: SimulationRunId;
  readonly artifactKind: 'step' | 'summary' | 'command';
  readonly payload: unknown;
  readonly createdAt: string;
}

export interface SimulationRepositoryQuery {
  readonly runId?: SimulationRunId;
  readonly scenarioId?: SimulationScenarioId;
  readonly state?: SimulationRunRecord['state'];
  readonly limit?: number;
  readonly cursor?: string;
}

export interface SimulationRepositoryPage {
  readonly items: readonly SimulationRunRecord[];
  readonly hasMore: boolean;
  readonly nextCursor?: string;
  readonly total: number;
}

export interface SimulationRepository {
  savePlan(plan: SimulationPlanManifest): Promise<boolean>;
  saveRun(run: SimulationRunRecord): Promise<boolean>;
  appendStep(runId: SimulationRunId, step: SimulationRunRecord['executedSteps'][number]): Promise<boolean>;
  recordCommand(command: SimulationCommand): Promise<boolean>;
  appendArtifact(artifact: SimulationArtifactEnvelope): Promise<boolean>;
  getRun(runId: SimulationRunId): Promise<SimulationRunRecord | undefined>;
  queryRuns(query: SimulationRepositoryQuery): Promise<SimulationRepositoryPage>;
}

export const isSimulationStoreArtifact = (value: unknown): value is SimulationArtifactEnvelope => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Partial<SimulationArtifactEnvelope>;
  return (
    typeof candidate.snapshotId === 'string'
    && typeof candidate.runId === 'string'
    && ['step', 'summary', 'command'].includes(candidate.artifactKind ?? '')
    && typeof candidate.createdAt === 'string'
  );
};
