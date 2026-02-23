import { Brand, Graph, NodeId, normalizeLimit, withBrand } from '@shared/core';

export type TenantId = Brand<string, 'TenantId'>;
export type WorkloadId = NodeId;
export type CommandRunbookId = Brand<string, 'CommandRunbookId'>;
export type CommandStepId = Brand<string, 'CommandStepId'>;
export type RecoverySignalId = Brand<string, 'RecoverySignalId'>;

export type StressPhase = 'observe' | 'isolate' | 'migrate' | 'restore' | 'verify' | 'standdown';
export type SeverityBand = 'low' | 'medium' | 'high' | 'critical';
export type SignalClass = 'availability' | 'integrity' | 'performance' | 'compliance';

export interface RecoverySignal {
  readonly id: RecoverySignalId;
  readonly class: SignalClass;
  readonly severity: SeverityBand;
  readonly title: string;
  readonly createdAt: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface WorkloadTarget {
  readonly tenantId: TenantId;
  readonly workloadId: WorkloadId;
  readonly commandRunbookId: CommandRunbookId;
  readonly name: string;
  readonly criticality: 1 | 2 | 3 | 4 | 5;
  readonly region: string;
  readonly azAffinity: readonly string[];
  readonly baselineRtoMinutes: number;
  readonly dependencies: readonly WorkloadId[];
}

export interface CommandStep {
  readonly commandId: CommandStepId;
  readonly title: string;
  readonly phase: StressPhase;
  readonly estimatedMinutes: number;
  readonly prerequisites: readonly CommandStepId[];
  readonly requiredSignals: readonly RecoverySignalId[];
}

export interface CommandRunbook {
  readonly id: CommandRunbookId;
  readonly tenantId: TenantId;
  readonly name: string;
  readonly description: string;
  readonly steps: readonly CommandStep[];
  readonly ownerTeam: string;
  readonly cadence: Readonly<{ weekday: number; windowStartMinute: number; windowEndMinute: number }>;
}

export interface WorkloadTopologyNode {
  readonly id: WorkloadId;
  readonly name: string;
  readonly ownerTeam: string;
  readonly criticality: WorkloadTarget['criticality'];
  readonly active: boolean;
}

export interface WorkloadTopologyEdge {
  readonly from: WorkloadId;
  readonly to: WorkloadId;
  readonly coupling: number;
  readonly reason: string;
}

export interface WorkloadTopology {
  readonly tenantId: TenantId;
  readonly nodes: readonly WorkloadTopologyNode[];
  readonly edges: readonly WorkloadTopologyEdge[];
}

export interface ReadinessWindow {
  readonly runbookId: CommandRunbookId;
  readonly startAt: string;
  readonly endAt: string;
  readonly phaseOrder: readonly StressPhase[];
}

export interface SimulationTick {
  readonly timestamp: string;
  readonly activeWorkloads: number;
  readonly blockedWorkloads: readonly WorkloadId[];
  readonly confidence: number;
}

export interface RecoverySimulationResult {
  readonly tenantId: TenantId;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly selectedRunbooks: readonly CommandRunbookId[];
  readonly ticks: readonly SimulationTick[];
  readonly riskScore: number;
  readonly slaCompliance: number;
  readonly notes: readonly string[];
}

export interface OrchestrationPlan {
  readonly tenantId: TenantId;
  readonly scenarioName: string;
  readonly schedule: ReadonlyArray<ReadinessWindow>;
  readonly runbooks: readonly CommandRunbook[];
  readonly dependencies: Graph<WorkloadId, { fromCriticality: number; toCriticality: number }>;
  readonly estimatedCompletionMinutes: number;
}

export interface StressRunState {
  readonly tenantId: TenantId;
  readonly selectedBand: SeverityBand;
  readonly selectedSignals: readonly RecoverySignal[];
  readonly plan: OrchestrationPlan | null;
  readonly simulation: RecoverySimulationResult | null;
}

export const createTenantId = (value: string): TenantId => withBrand(value, 'TenantId');
export const createWorkloadId = (value: string): WorkloadId => withBrand(value, 'NodeId');
export const createRunbookId = (value: string): CommandRunbookId => withBrand(value, 'CommandRunbookId');
export const createStepId = (value: string): CommandStepId => withBrand(value, 'CommandStepId');
export const createSignalId = (value: string): RecoverySignalId => withBrand(value, 'RecoverySignalId');

export const normalizeTenantLimit = normalizeLimit;
export const severityRank: Record<SeverityBand, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const clampConfidence = (value: number): number => {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
};

export const rankByCriticality = (a: WorkloadTarget, b: WorkloadTarget): number => {
  return b.criticality - a.criticality;
};

export const mergeSignals = (left: readonly RecoverySignal[], right: readonly RecoverySignal[]) => {
  const byId = new Map<string, RecoverySignal>();

  for (const signal of left) {
    byId.set(signal.id, signal);
  }
  for (const signal of right) {
    byId.set(signal.id, signal);
  }

  return Array.from(byId.values()).sort((first, second) => severityRank[second.severity] - severityRank[first.severity]);
};

export type DraftTemplate = {
  tenantId: TenantId;
  title: string;
  band: SeverityBand;
  selectedRunbooks: CommandRunbookId[];
  selectedSignals: RecoverySignal['id'][];
};

export const pickTopSignals = (
  signals: readonly RecoverySignal[],
  limit: number,
): ReadonlyArray<RecoverySignal> => {
  const safeLimit = normalizeLimit(limit);
  return signals
    .slice()
    .sort((a, b) => severityRank[b.severity] - severityRank[a.severity])
    .slice(0, safeLimit);
};
