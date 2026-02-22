import type { MessageId } from '@shared/protocol';

import type {
  RecoveryCheckpoint,
  RecoveryProgram,
  RecoveryRunId,
  RecoveryRunState,
} from '@domain/recovery-orchestration';

export type RecoveryArtifactId = `${RecoveryRunId}:${MessageId}`;

export interface RecoveryArtifact {
  id: RecoveryArtifactId;
  runId: RecoveryRunId;
  eventId: MessageId;
  recordedAt: string;
  run: RecoveryRunState;
  program: RecoveryProgram;
  checkpoint?: RecoveryCheckpoint;
}

export interface RecoveryArtifactFilter {
  runId?: RecoveryRunId;
  tenant?: string;
  status?: RecoveryRunState['status'][];
}

export interface RecoveryTimelineSegment {
  name: string;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  healthy: boolean;
  details: Record<string, unknown>;
}

export interface RecoveryTrace {
  runId: RecoveryRunId;
  segments: RecoveryTimelineSegment[];
}
