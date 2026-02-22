import { z } from 'zod';

import type { RecoveryArtifact } from '@data/recovery-artifacts';
import type { RecoveryCheckpoint, RecoveryRunState } from '@domain/recovery-orchestration';

export type HealthSignal = 'steady' | 'degraded' | 'critical' | 'terminal';
export type FleetPulse = 'improving' | 'stable' | 'degrading';

export interface RecoveryTimelinePoint {
  readonly at: string;
  readonly status: RecoveryRunState['status'];
  readonly stepId?: string;
  readonly exitCode?: number;
  readonly healthy: boolean;
}

export interface RecoveryRunDigest {
  readonly runId: RecoveryRunState['runId'];
  readonly tenant: string;
  readonly service: string;
  readonly health: HealthSignal;
  readonly score: number;
  readonly status: RecoveryRunState['status'];
  readonly elapsedMinutes: number;
  readonly timeline: readonly RecoveryTimelinePoint[];
  readonly checkpoints: readonly RecoveryCheckpoint[];
}

export interface RecoveryFleetDigest {
  readonly tenant: string;
  readonly service: string;
  readonly runCount: number;
  readonly avgScore: number;
  readonly terminalRate: number;
  readonly pulse: FleetPulse;
}

export interface RecoverySuggestion {
  readonly runId: RecoveryRunState['runId'];
  readonly severity: HealthSignal;
  readonly reason: string;
  readonly actions: readonly string[];
  readonly confidence: number;
}

export interface RecoveryObservabilitySnapshot {
  readonly generatedAt: string;
  readonly records: readonly RecoveryRunDigest[];
  readonly fleets: readonly RecoveryFleetDigest[];
  readonly suggestions: readonly RecoverySuggestion[];
}

const HealthSignalSchema = z.enum(['steady', 'degraded', 'critical', 'terminal']);
export const parseHealthSignal = (value: unknown): HealthSignal => HealthSignalSchema.parse(value);

export const inferHealthSignal = (score: number): HealthSignal => {
  if (score >= 90) return 'steady';
  if (score >= 60) return 'degraded';
  if (score >= 35) return 'critical';
  return 'terminal';
};

export const digestFromArtifact = (artifact: RecoveryArtifact): RecoveryRunDigest => {
  const checkpointScore = artifact.checkpoint ? Math.max(0, 100 - artifact.checkpoint.exitCode * 7) : 100;
  const timelinePoint: RecoveryTimelinePoint = {
    at: artifact.recordedAt,
    status: artifact.run.status,
    stepId: artifact.checkpoint?.stepId,
    exitCode: artifact.checkpoint?.exitCode,
    healthy: artifact.run.status === 'completed',
  };
  const elapsedMinutes = artifact.run.startedAt
    ? Math.max(0, Date.parse(artifact.recordedAt) - Date.parse(artifact.run.startedAt)) / 60000
    : 0;

  return {
    runId: artifact.runId,
    tenant: `${artifact.program.tenant}`,
    service: `${artifact.program.service}`,
    health: inferHealthSignal(checkpointScore),
    score: checkpointScore,
    status: artifact.run.status,
    elapsedMinutes,
    timeline: [timelinePoint],
    checkpoints: artifact.checkpoint ? [artifact.checkpoint] : [],
  };
};
