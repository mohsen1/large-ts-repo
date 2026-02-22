import type {
  RecoveryArtifact,
  RecoveryArtifactFilter,
  RecoveryTimelineSegment,
  RecoveryTrace,
} from './models';

import type {
  RecoveryRunId,
  RecoveryRunState,
} from '@domain/recovery-orchestration';

export interface RecoveryArtifactRepository {
  save(artifact: RecoveryArtifact): Promise<boolean>;
  findByRunId(runId: RecoveryRunId): Promise<RecoveryArtifact | undefined>;
  queryArtifacts(filter: RecoveryArtifactFilter): Promise<readonly RecoveryArtifact[]>;
  appendTimeline(runId: RecoveryRunId, segment: RecoveryTimelineSegment): Promise<boolean>;
  getActiveRuns(): Promise<readonly RecoveryRunState[]>;
}

export interface RecoveryRunRepository {
  getRun(runId: RecoveryRunId): Promise<RecoveryRunState | undefined>;
  setRun(runState: RecoveryRunState): Promise<boolean>;
  getActiveRuns(): Promise<readonly RecoveryRunState[]>;
}

export class InMemoryRecoveryArtifactRepository implements RecoveryArtifactRepository {
  private readonly artifacts = new Map<string, RecoveryArtifact>();
  private readonly timeline = new Map<RecoveryRunId, RecoveryTimelineSegment[]>();
  private readonly runs = new Map<RecoveryRunId, RecoveryRunState>();

  async save(artifact: RecoveryArtifact): Promise<boolean> {
    this.artifacts.set(artifact.id, artifact);
    this.runs.set(artifact.runId, artifact.run);
    return true;
  }

  async findByRunId(runId: RecoveryRunId): Promise<RecoveryArtifact | undefined> {
    let latest: RecoveryArtifact | undefined;
    for (const artifact of this.artifacts.values()) {
      if (artifact.runId === runId && (!latest || latest.recordedAt < artifact.recordedAt)) {
        latest = artifact;
      }
    }
    return latest;
  }

  async queryArtifacts(filter: RecoveryArtifactFilter): Promise<readonly RecoveryArtifact[]> {
    return Array.from(this.artifacts.values()).filter((artifact) => {
      if (filter.runId && artifact.runId !== filter.runId) return false;
      if (filter.tenant && artifact.program.tenant !== filter.tenant) return false;
      if (filter.status && filter.status.length > 0 && !filter.status.includes(artifact.run.status)) return false;
      return true;
    });
  }

  async appendTimeline(runId: RecoveryRunId, segment: RecoveryTimelineSegment): Promise<boolean> {
    const current = this.timeline.get(runId) ?? [];
    this.timeline.set(runId, [...current, segment]);
    return true;
  }

  async getRuns(): Promise<readonly RecoveryArtifact[]> {
    return Array.from(this.artifacts.values());
  }

  async getTrace(runId: RecoveryRunId): Promise<RecoveryTrace | undefined> {
    const artifact = await this.findByRunId(runId);
    if (!artifact) return undefined;
    return { runId, segments: this.timeline.get(runId) ?? [] };
  }

  async hydrateRun(runState: RecoveryRunState): Promise<boolean> {
    this.runs.set(runState.runId, runState);
    return true;
  }

  async getRun(runId: RecoveryRunId): Promise<RecoveryRunState | undefined> {
    return this.runs.get(runId);
  }

  async setRun(runState: RecoveryRunState): Promise<boolean> {
    this.runs.set(runState.runId, runState);
    return true;
  }

  async getActiveRuns(): Promise<readonly RecoveryRunState[]> {
    return Array.from(this.runs.values()).filter((run) => run.status === 'running' || run.status === 'staging');
  }
}
