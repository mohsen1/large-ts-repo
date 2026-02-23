import { z } from 'zod';

export type IsoUtc = `${number}-${number}-${number}T${number}:${number}:${number}Z`;

export interface TimelineNodeIdParts {
  timelineId: string;
  sequence: number;
}

export interface RecoveryTimelineEvent {
  id: string;
  timelineId: string;
  title: string;
  owner: string;
  phase: TimelinePhase;
  start: Date;
  end: Date;
  state: TimelineState;
  riskScore: number;
  dependencies: string[];
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface RecoveryTimelineSegment {
  id: string;
  timelineId: string;
  name: string;
  targetDurationMinutes: number;
  earliestStart?: Date;
  latestEnd?: Date;
}

export interface RecoveryTimeline {
  id: string;
  name: string;
  environment: string;
  ownerTeam: string;
  events: RecoveryTimelineEvent[];
  segments: RecoveryTimelineSegment[];
  policyVersion: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface RecoveryTelemetrySnapshot {
  timelineId: string;
  source: string;
  measuredAt: Date;
  confidence: number;
  expectedReadyAt: Date;
  actualReadyAt?: Date;
  note: string;
}

export interface ForecastEnvelope {
  scenarioId: string;
  timelineId: string;
  forecastAt: Date;
  horizonMinutes: number;
  confidenceBand: [number, number];
  events: RecoveryTimelineEvent[];
}

export type TimelinePhase = 'prepare' | 'mitigate' | 'restore' | 'verify' | 'stabilize';
export type TimelineState = 'queued' | 'running' | 'blocked' | 'completed' | 'failed';
export type RiskBand = 'low' | 'medium' | 'high' | 'critical';

const TimelineNodeSchema = z.object({
  id: z.string().min(1),
  timelineId: z.string().min(1),
  title: z.string().min(1),
  owner: z.string().min(1),
  phase: z.enum(['prepare', 'mitigate', 'restore', 'verify', 'stabilize']),
  start: z.date(),
  end: z.date(),
  state: z.enum(['queued', 'running', 'blocked', 'completed', 'failed']),
  riskScore: z.number().min(0).max(100),
  dependencies: z.array(z.string()),
  metadata: z.record(z.unknown()),
  createdAt: z.date(),
});

export const RecoveryTimelineEventSchema = TimelineNodeSchema.extend({
  metadata: z.record(z.unknown()),
});

export const RecoveryTimelineSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  environment: z.string().min(1),
  ownerTeam: z.string().min(1),
  events: z.array(RecoveryTimelineEventSchema),
  segments: z.array(z.object({
    id: z.string().min(1),
    timelineId: z.string().min(1),
    name: z.string().min(1),
    targetDurationMinutes: z.number().positive(),
    earliestStart: z.date().optional(),
    latestEnd: z.date().optional(),
  })),
  policyVersion: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export function clampTimelineId(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

export function classifyRisk(score: number): RiskBand {
  if (score >= 85) {
    return 'critical';
  }
  if (score >= 65) {
    return 'high';
  }
  if (score >= 40) {
    return 'medium';
  }
  return 'low';
}

export function toNodeParts(id: string): TimelineNodeIdParts {
  const [timelineId, sequenceString] = id.split(':');
  const sequence = Number.parseInt(sequenceString, 10);
  return {
    timelineId: timelineId ?? '',
    sequence: Number.isNaN(sequence) ? 0 : sequence,
  };
}
