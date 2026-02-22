import { withBrand } from '@shared/core';
import type {
  RecoveryReadinessPlanDraft,
  ReadinessPolicy,
  ReadinessRunId,
  ReadinessSignal,
} from '@domain/recovery-readiness';

export type SimulationRunId = ReturnType<typeof withBrand>;
export type SimulationWaveId = ReturnType<typeof withBrand>;
export type SimulationStatus = 'pending' | 'running' | 'complete' | 'blocked';

export interface SimulationNode {
  readonly id: string;
  readonly owner: 'sre' | 'platform' | 'core' | 'security';
  readonly criticality: 1 | 2 | 3 | 4 | 5;
  readonly region?: string;
  readonly expectedSignalsPerMinute: number;
}

export interface SimulationDependency {
  readonly from: string;
  readonly to: string;
  readonly reason: string;
}

export interface SimulationGraph {
  readonly nodes: readonly SimulationNode[];
  readonly dependencies: readonly SimulationDependency[];
}

export interface SimulationWindow {
  readonly waveId: SimulationWaveId;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly expectedSignals: number;
  readonly targetCount: number;
  readonly windowIndex: number;
}

export interface SignalDensityPoint {
  readonly minute: number;
  readonly signals: number;
  readonly weightedSeverity: number;
}

export interface SimulationConstraint {
  readonly maxSignalsPerWave: number;
  readonly maxParallelNodes: number;
  readonly blackoutWindows: readonly SimulationWindow[];
  readonly minWindowCoverage: number;
  readonly maxRiskScore: number;
}

export interface SimulationPolicyEnvelope {
  readonly planId: string;
  readonly policyId: ReadinessPolicy['policyId'];
  readonly constraints: SimulationConstraint;
  readonly tenant: string;
  readonly seed: number;
  readonly generatedAt: string;
}

export interface SimulationPolicyViolation {
  readonly reason: string;
  readonly nodeId: string;
  readonly severity: number;
}

export interface SimulationCommand {
  readonly tenant: string;
  readonly runId: ReadinessRunId;
  readonly seed: number;
  readonly targetIds: readonly string[];
}

export interface SimulationAllocation {
  readonly waveId: SimulationWaveId;
  readonly nodeIds: readonly string[];
  readonly ownerMix: Readonly<Record<string, number>>;
  readonly expectedSignals: number;
  readonly coverageRatio: number;
}

export interface SimulationPlanInput {
  readonly tenant: string;
  readonly runId: ReadinessRunId;
  readonly draft: RecoveryReadinessPlanDraft;
  readonly signals: readonly ReadinessSignal[];
  readonly graph: SimulationGraph;
  readonly policy: ReadinessPolicy;
  readonly constraints?: SimulationConstraint;
}

export interface SimulationWave {
  readonly id: SimulationWaveId;
  readonly sequence: readonly SimulationRunId[];
  readonly readyAt: string;
  readonly parallelism: number;
  readonly signalCount: number;
  readonly window: SimulationWindow;
}

export interface SimulationSummary {
  readonly runId: SimulationRunId;
  readonly status: SimulationStatus;
  readonly coverageRatio: number;
  readonly signalCoverage: number;
  readonly nodeCoverage: number;
  readonly riskProfile: 'green' | 'amber' | 'red';
  readonly constraints: SimulationConstraint;
  readonly waves: readonly SimulationWave[];
  readonly allocations: readonly SimulationAllocation[];
  readonly policyViolations: readonly SimulationPolicyViolation[];
}

export interface SimulationPlan {
  readonly runId: SimulationRunId;
  readonly tenant: string;
  readonly seed: number;
  readonly createdAt: string;
  readonly waves: readonly SimulationWave[];
  readonly projectedSignals: readonly SignalDensityPoint[];
  readonly summary: SimulationSummary;
}

export interface SimulationMetrics {
  readonly runId: SimulationRunId;
  readonly wavesExecuted: number;
  readonly signalProcessingRate: number;
  readonly latencyP50Ms: number;
  readonly ownerCoverage: Readonly<Record<string, number>>;
  readonly riskSignalCount: number;
  readonly blockedSignalCount: number;
  readonly avgSignalsPerWave: number;
  readonly waveCoverageProfile: readonly number[];
}

export interface SimulationPlanEnvelope {
  readonly plan: SimulationPlan;
  readonly metrics: SimulationMetrics;
  readonly notes: readonly string[];
}

export interface SimulationWorkspaceSnapshot {
  readonly runId: SimulationRunId;
  readonly executedWaves: number;
  readonly status: SimulationStatus;
  readonly completedSignals: number;
  readonly projectedSignalCoverage: number;
}

export interface SimulationRuntimeEnvelope {
  readonly payload: Readonly<SimulationPlanEnvelope>;
  readonly startedAt: string;
  readonly stoppedAt?: string;
  readonly notes: ReadonlyArray<string>;
}

export const simulationWaveIdFromRunId = (runId: ReadinessRunId | SimulationRunId, index: number): SimulationWaveId =>
  withBrand(`${runId}:wave:${index}`, 'ReadinessSimulationWaveId');

export const makeSimulationRunId = (value: string): SimulationRunId =>
  withBrand(value, 'ReadinessSimulationRunId');

export const makeSimulationWaveId = (value: string): SimulationWaveId =>
  withBrand(value, 'ReadinessSimulationWaveId');

export const defaultConstraint = (targetCount: number): SimulationConstraint => ({
  maxSignalsPerWave: Math.max(2, targetCount * 2),
  maxParallelNodes: Math.max(1, Math.min(8, targetCount || 1)),
  blackoutWindows: [],
  minWindowCoverage: 0.2,
  maxRiskScore: 24,
});

export const normalizeConstraint = (value: SimulationConstraint): SimulationConstraint => {
  const input = value ?? defaultConstraint(1);
  return {
    maxSignalsPerWave: Math.max(1, Math.floor(input.maxSignalsPerWave)),
    maxParallelNodes: Math.max(1, Math.floor(input.maxParallelNodes)),
    blackoutWindows: input.blackoutWindows.map((window) => ({
      ...window,
      expectedSignals: Math.max(0, Math.floor(window.expectedSignals)),
      targetCount: Math.max(0, Math.floor(window.targetCount)),
      windowIndex: Math.max(0, Math.floor(window.windowIndex)),
    })),
    minWindowCoverage: Math.min(1, Math.max(0, input.minWindowCoverage)),
    maxRiskScore: Math.max(0, Math.floor(input.maxRiskScore)),
  };
};

export const createPolicyEnvelope = (input: {
  readonly tenant: string;
  readonly planId: string;
  readonly policy: ReadinessPolicy;
  readonly constraints: SimulationConstraint;
  readonly seed: number;
}): SimulationPolicyEnvelope => ({
  tenant: input.tenant,
  planId: input.planId,
  policyId: input.policy.policyId,
  constraints: normalizeConstraint(input.constraints),
  seed: input.seed,
  generatedAt: new Date().toISOString(),
});
