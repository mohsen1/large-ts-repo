import type { Brand, Merge } from '@shared/type-level';
import type { RecoveryReadinessPlan, ReadinessSloProfile, RiskBand } from '@domain/recovery-readiness';
import type { RecoverySignal, RunSession, RunPlanSnapshot } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';

export type ForgePlanId = Brand<string, 'RecoveryForgePlanId'>;
export type ForgeRunId = Brand<string, 'RecoveryForgeRunId'>;
export type ForgeAttemptId = Brand<string, 'RecoveryForgeAttemptId'>;
export type ForgeDependencyId = Brand<string, 'RecoveryForgeDependencyId'>;

export type ForgeUrgency = 'routine' | 'urgent' | 'critical';
export type ForgeConfidence = 'low' | 'medium' | 'high' | 'extreme';
export type ForgeOutcome = 'approved' | 'blocked' | 'deferred' | 'aborted';

export interface ForgeBudgetEnvelope {
  readonly parallelismLimit: number;
  readonly retryLimit: number;
  readonly maxDurationMinutes: number;
  readonly approvalRequired: boolean;
}

export interface ForgeDependency {
  readonly dependencyId: ForgeDependencyId;
  readonly dependencyName: string;
  readonly criticality: 1 | 2 | 3 | 4 | 5;
  readonly coupling: number;
}

export interface ForgeNode {
  readonly id: string;
  readonly label: string;
  readonly commandType: string;
  readonly expectedDurationMinutes: number;
  readonly ownerTeam: string;
  readonly dependencies: readonly ForgeDependency[];
  readonly resourceTags: readonly string[];
}

export interface ForgeEdge {
  readonly from: string;
  readonly to: string;
  readonly dependencyStrength: number;
  readonly isOptional: boolean;
}

export interface ForgeGraph {
  readonly planId: ForgePlanId;
  readonly tenant: string;
  readonly createdAt: string;
  readonly nodes: readonly ForgeNode[];
  readonly edges: readonly ForgeEdge[];
}

export type ForgeNodePriority = Record<string, number>;

export interface ForgeRunAttempt {
  readonly attemptId: ForgeAttemptId;
  readonly runId: ForgeRunId;
  readonly status: 'queued' | 'executing' | 'complete' | 'failed';
  readonly startedAt: string;
  readonly finishedAt?: string;
  readonly nodeCount: number;
  readonly executedNodeIds: readonly string[];
}

export interface ForgeForecast {
  readonly forecastId: Brand<string, 'RecoveryForgeForecastId'>;
  readonly planId: ForgePlanId;
  readonly commandWindowMinutes: number;
  readonly signalVolume: number;
  readonly expectedRisk: number;
  readonly projectedSloMargin: number;
  readonly createdAt: string;
}

export interface ForgeSimulationOutcome {
  readonly outcome: ForgeOutcome;
  readonly attempts: readonly ForgeRunAttempt[];
  readonly forecast: ForgeForecast;
  readonly confidenceBand: ForgeConfidence;
  readonly notes: readonly string[];
}

export interface ForgePolicyGate {
  readonly gateId: Brand<string, 'RecoveryForgeGateId'>;
  readonly name: string;
  readonly passRate: number;
  readonly threshold: number;
  readonly details: string;
}

export interface ForgePolicyResult {
  readonly planId: ForgePlanId;
  readonly summary: string;
  readonly pass: boolean;
  readonly urgency: ForgeUrgency;
  readonly riskScore: number;
  readonly gates: readonly ForgePolicyGate[];
}

export interface ForgeScenario {
  readonly tenant: string;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly session: RunSession;
  readonly planSnapshot: RunPlanSnapshot;
  readonly signals: readonly RecoverySignal[];
  readonly budget: ForgeBudgetEnvelope;
  readonly slaProfile: ReadinessSloProfile;
}

export interface ForgeNodeState {
  readonly node: ForgeNode;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly progress: number;
}

export interface ForgeTopology {
  readonly planId: ForgePlanId;
  readonly wave: number;
  readonly nodes: readonly ForgeNodeState[];
}

export interface ForgeExecutionReport {
  readonly tenant: string;
  readonly scenarioHash: string;
  readonly topologies: readonly ForgeTopology[];
  readonly policy: ForgePolicyResult;
  readonly outcomes: readonly ForgeSimulationOutcome[];
  readonly generatedAt: string;
}

export interface ForgeAdapterContext {
  readonly tenant: string;
  readonly urgency: ForgeUrgency;
  readonly maxNodes: number;
  readonly includeReadinessSignals: boolean;
}

export interface ForgeRuntimeConfig {
  readonly defaultUrgency: ForgeUrgency;
  readonly maxBudgetMinutes: number;
  readonly minConfidence: number;
  readonly policyGateEnabled: boolean;
}

export interface ForgeScoreCard {
  readonly score: number;
  readonly band: ForgeConfidence;
  readonly rationale: readonly string[];
  readonly dimensions: {
    readonly resilience: number;
    readonly speed: number;
    readonly risk: number;
    readonly operability: number;
  };
}

export interface ForgeMetrics {
  readonly planId: ForgePlanId;
  readonly readinessCoverage: number;
  readonly orchestrationCoverage: number;
  readonly signalDensity: number;
  readonly blastRadius: number;
  readonly commandCount: number;
}

export const createForgeIds = (seed?: string) => {
  const now = seed ?? String(Date.now());
  return {
    planId: withBrand(`forge-plan-${now}`, 'RecoveryForgePlanId'),
    runId: withBrand(`forge-run-${now}`, 'RecoveryForgeRunId'),
    attemptId: withBrand(`forge-attempt-${now}`, 'RecoveryForgeAttemptId'),
    dependencyId: withBrand(`forge-dep-${now}`, 'RecoveryForgeDependencyId'),
  } as const;
};

export const mergeDependencies = (
  ...groups: readonly (readonly ForgeDependency[])[]
): readonly ForgeDependency[] => {
  const dedup = new Map<string, ForgeDependency>();
  for (const group of groups) {
    for (const dependency of group) {
      if (!dedup.has(dependency.dependencyId)) {
        dedup.set(dependency.dependencyId, dependency);
      }
    }
  }
  return [...dedup.values()];
};

export const classifyConfidenceBand = (risk: number, coverage: number): ForgeConfidence => {
  if (risk < 25 && coverage > 0.85) {
    return 'extreme';
  }
  if (risk < 50 && coverage > 0.7) {
    return 'high';
  }
  if (risk < 75 && coverage > 0.5) {
    return 'medium';
  }
  return 'low';
};

export const severityFromBand = (band: RiskBand): number => {
  if (band === 'green') {
    return 20;
  }
  if (band === 'amber') {
    return 45;
  }
  return 85;
};

export const buildForgeMetrics = (
  topologies: readonly ForgeTopology[],
  outcomes: readonly ForgeSimulationOutcome[],
): ForgeMetrics => {
  const commandCount = topologies.reduce((acc, topology) => acc + topology.nodes.length, 0);
  const coverage = topologies.length ? Math.round((commandCount / topologies.length) * 10) : 0;
  const signalDensity = outcomes.reduce((acc, outcome) => acc + outcome.forecast.signalVolume, 0);

  return {
    planId: withBrand(`metrics-${Date.now()}`, 'RecoveryForgePlanId'),
    readinessCoverage: Math.min(100, signalDensity + outcomes.length * 3 + 10),
    orchestrationCoverage: Math.min(100, coverage + 20),
    signalDensity,
    blastRadius: outcomes.length * 5 + topologies.length,
    commandCount,
  };
};

export const buildScoreCard = (policy: ForgePolicyResult): ForgeScoreCard => {
  const resilience = Math.round(policy.riskScore * 0.7 + 20);
  const speed = Math.round((policy.riskScore - 30) * 0.6 + 30);
  const operability = Math.round(policy.riskScore + 20);
  const risk = Math.round(100 - policy.riskScore);
  const total = [resilience, speed, operability, risk].reduce((acc, value) => acc + value, 0) / 4;
  const band = classifyConfidenceBand(100 - policy.riskScore, Math.min(1, policy.gates.length / 4));

  return {
    score: total,
    band,
    rationale: policy.gates.map((gate) => `${gate.name}:${gate.passRate}`),
    dimensions: {
      resilience,
      speed: Math.max(0, Math.min(100, speed)),
      risk,
      operability: Math.max(0, Math.min(100, operability)),
    },
  };
};

export const mergePlans = (existing: ForgeExecutionReport, current: ForgeExecutionReport): Merge<ForgeExecutionReport, { readonly topologies: readonly ForgeTopology[] }> => ({
  ...current,
  topologies: [...existing.topologies, ...current.topologies],
});
