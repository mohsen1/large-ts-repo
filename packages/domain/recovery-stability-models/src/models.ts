import type { Brand } from '@shared/core';
import { z } from 'zod';

export type StabilitySignalId = Brand<string, 'StabilitySignalId'>;
export type StabilityRunId = Brand<string, 'StabilityRunId'>;
export type ServiceNodeId = Brand<string, 'ServiceNodeId'>;

export type AlertClass = 'capacity' | 'latency' | 'error-rate' | 'integration-failure' | 'dependency-outage';

export type StabilityWindow = 'p1m' | 'p5m' | 'p15m' | 'p1h' | 'p6h';

export interface RecoveryObjective {
  readonly id: Brand<string, 'RecoveryObjectiveId'>;
  readonly name: string;
  readonly targetRtoMinutes: number;
  readonly targetRpoSeconds: number;
  readonly allowedBlastRadius: number;
  readonly criticality: 1 | 2 | 3 | 4 | 5;
}

export interface ServiceDependencyEdge {
  readonly from: ServiceNodeId;
  readonly to: ServiceNodeId;
  readonly coupling: number;
  readonly latencyBudgetMs: number;
}

export interface RecoveryServiceTopology {
  readonly runId: StabilityRunId;
  readonly services: ReadonlyArray<ServiceNodeId>;
  readonly edges: ReadonlyArray<ServiceDependencyEdge>;
  readonly criticalityByService: Record<ServiceNodeId, number>;
  readonly createdAt: string;
}

export interface StabilitySignal {
  readonly id: StabilitySignalId;
  readonly runId: StabilityRunId;
  readonly serviceId: ServiceNodeId;
  readonly alertClass: AlertClass;
  readonly value: number;
  readonly window: StabilityWindow;
  readonly threshold: number;
  readonly observedAt: string;
  readonly tags: ReadonlyArray<string>;
}

export interface StabilityEnvelope {
  readonly id: StabilityRunId;
  readonly objective: RecoveryObjective;
  readonly signals: ReadonlyArray<StabilitySignal>;
  readonly topology: RecoveryServiceTopology;
  readonly owner: string;
  readonly notes: ReadonlyArray<string>;
  readonly metadata: Record<string, string | number | boolean | null>;
}

export interface StabilityDecision {
  readonly runId: StabilityRunId;
  readonly decisionAt: string;
  readonly recommendedActions: ReadonlyArray<string>;
  readonly confidence: number;
  readonly rationale: ReadonlyArray<string>;
}

export interface StabilityScenario {
  readonly id: StabilityRunId;
  readonly objective: RecoveryObjective;
  readonly sourceSignalIds: ReadonlyArray<StabilitySignalId>;
  readonly timeline: ReadonlyArray<StabilityDecision>;
}

export const stabilitySignalSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  serviceId: z.string().min(1),
  alertClass: z.enum(['capacity', 'latency', 'error-rate', 'integration-failure', 'dependency-outage']),
  value: z.number().finite(),
  window: z.enum(['p1m', 'p5m', 'p15m', 'p1h', 'p6h']),
  threshold: z.number().finite(),
  observedAt: z.string().datetime({ offset: true }),
  tags: z.array(z.string()),
});

export type ParsedSignal = z.infer<typeof stabilitySignalSchema>;

export const parseSignal = (input: unknown): ParsedSignal => {
  return stabilitySignalSchema.parse(input);
};

export type WindowRank = {
  readonly [W in StabilityWindow]: number;
};

export type ScoreVec<T extends string> = Record<T, number>;

export type HealthGrade = 'green' | 'yellow' | 'orange' | 'red';

export const scoreToGrade = (score: number): HealthGrade => {
  if (score >= 90) return 'green';
  if (score >= 75) return 'yellow';
  if (score >= 50) return 'orange';
  return 'red';
};

export const gradePriority: Record<HealthGrade, number> = {
  green: 0,
  yellow: 1,
  orange: 2,
  red: 3,
};
