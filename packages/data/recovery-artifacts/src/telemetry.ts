import type { RecoveryArtifactRepository, RecoveryTimelineSegment, RecoveryRunState } from './repository';
import type { RecoveryArtifact } from './models';

export interface RecoveryTimelineRecorder {
  recordSegment(runId: RecoveryRunState['runId'], segment: RecoveryTimelineSegment): Promise<boolean>;
}

export class InMemoryTimelineRecorder {
  private readonly buffer = new Map<string, RecoveryTimelineSegment[]>();

  async recordSegment(runId: RecoveryRunState['runId'], segment: RecoveryTimelineSegment): Promise<boolean> {
    const existing = this.buffer.get(runId) ?? [];
    this.buffer.set(runId, [...existing, segment]);
    return true;
  }

  async history(runId: RecoveryRunState['runId']): Promise<readonly RecoveryTimelineSegment[]> {
    return this.buffer.get(runId) ?? [];
  }
}

export const attachRecorderToRepository = (
  repository: RecoveryArtifactRepository,
  recorder: RecoveryTimelineRecorder,
) => {
  return async (runId: RecoveryRunState['runId'], segment: RecoveryTimelineSegment) => {
    await recorder.recordSegment(runId, segment);
    return repository.appendTimeline(runId, segment);
  };
};

export const deriveHealth = (record: RecoveryArtifact): number => {
  if (!record.checkpoint) return 100;
  if (record.checkpoint.exitCode === 0) return 100;
  return Math.max(0, 100 - Math.abs(record.checkpoint.exitCode) * 10);
};
