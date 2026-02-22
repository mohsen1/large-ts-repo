import { normalizeLimit } from '@shared/core';
import { ok, fail, type Result } from '@shared/result';

import {
  type FabricAllocation,
  type FabricCandidate,
  type FabricRunId,
  type FabricScenario,
  type FabricTrace,
  evaluateCandidatePolicy,
} from '@domain/recovery-fabric-models';

export interface FabricScenarioRunPoint {
  readonly node: string;
  readonly atMs: number;
  readonly healthy: boolean;
}

export interface FabricSimulationInput {
  readonly scenario: FabricScenario;
  readonly candidate: FabricCandidate;
  readonly allocation: FabricAllocation;
  readonly runId: FabricRunId;
  readonly limit?: number;
}

export interface FabricSimulationSummary {
  readonly runId: FabricRunId;
  readonly successProbability: number;
  readonly predictedMinutes: number;
  readonly riskTrail: readonly FabricScenarioRunPoint[];
}

export const runScenarioSimulation = (
  input: FabricSimulationInput,
): Result<FabricSimulationSummary, Error> => {
  const policy = evaluateCandidatePolicy(input.candidate, input.scenario, input.runId);
  if (!policy.allowed) {
    return fail(new Error(policy.reason));
  }

  const limit = normalizeLimit(input.limit ?? 24);
  const trace = buildRunTrail(input);
  if (trace.length === 0) return fail(new Error('empty-simulation-trace'));

  const riskPenalty = computeRiskPenalty(input);
  const predictedMinutes = Math.max(1, Math.round(trace.length / 2 + riskPenalty * 30));
  const successProbability = Number(Math.max(0.02, Math.min(0.99, 1 - riskPenalty)).toFixed(4));

  return ok({
    runId: input.runId,
    successProbability,
    predictedMinutes,
    riskTrail: trace.slice(0, limit),
  });
};

const buildRunTrail = (input: FabricSimulationInput): readonly FabricScenarioRunPoint[] => {
  const nodes = input.allocation.allocatedNodeIds;
  const baseNow = Date.now();
  return nodes.map((node, index) => ({
    node,
    atMs: baseNow + index * 12_000,
    healthy: (input.scenario.nodes[index % input.scenario.nodes.length]?.resilienceScore ?? 0) > 45,
  }));
};

const computeRiskPenalty = (input: FabricSimulationInput): number => {
  const readiness = input.scenario.nodes.map((entry) => entry.readiness);
  if (readiness.length === 0) return 0.8;
  const meanReadiness = readiness.reduce((sum, next) => sum + next, 0) / readiness.length;
  const nodeRisk = 1 - meanReadiness;
  const allocationStretch = Math.max(1, input.allocation.allocatedNodeIds.length) / Math.max(1, input.scenario.nodes.length);
  const resilienceVariance = Math.max(...input.scenario.nodes.map((entry) => entry.resilienceScore)) / 100;
  return Math.min(1, nodeRisk + allocationStretch * 0.33 + (1 - resilienceVariance) * 0.1);
};
