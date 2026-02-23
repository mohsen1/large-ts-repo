import type { ForgePolicyGate, ForgePolicyResult, ForgeGraph, ForgeBudgetEnvelope, ForgeExecutionReport } from './types';
import { classifyConfidenceBand, severityFromBand } from './types';
import type { RiskBand } from '@domain/recovery-readiness';
import type { RecoverySignal } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';

interface BuildPolicyInput {
  readonly urgency: ForgePolicyResult['urgency'];
  readonly budget: ForgeBudgetEnvelope;
  readonly graphHealth: {
    readonly hasCycles: boolean;
    readonly averageFanIn: number;
    readonly averageFanOut: number;
    readonly nodeCount: number;
    readonly edgeCount: number;
  };
  readonly slaWindow: number;
  readonly nodeCount: number;
  readonly coverage: number;
  readonly signals: readonly RecoverySignal[];
  readonly readinessRisk: RiskBand;
  readonly priorities: Record<string, number>;
}

const buildGate = (
  name: string,
  passRate: number,
  threshold: number,
  details: string,
): ForgePolicyGate => ({
  gateId: withBrand(`gate-${name}-${Date.now()}`, 'RecoveryForgeGateId'),
  name,
  passRate,
  threshold,
  details,
});

export const buildPolicy = (input: BuildPolicyInput): ForgePolicyResult => {
  const gates = [
    buildGate('criticality', input.budget.approvalRequired ? 0.4 : 0.8, 0.75, `parallelism=${input.budget.parallelismLimit}`),
    buildGate('slo-compliance', input.slaWindow > 10 ? 1 : 0.2, 0.9, `slaWindow=${input.slaWindow}`),
    buildGate('density', Math.min(1, input.nodeCount / Math.max(1, input.graphHealth.edgeCount)), 0.4, `nodes=${input.nodeCount}`),
    buildGate('signal', Math.min(1, input.signals.length / 25), 0.5, `signals=${input.signals.length}`),
    buildGate('cycle', input.graphHealth.hasCycles ? 0.2 : 1, 0.8, `cycles=${input.graphHealth.hasCycles}`),
  ];

  const averageFan = (input.graphHealth.averageFanIn + input.graphHealth.averageFanOut) / 2;
  const passRateMean = gates.reduce((acc, gate) => acc + gate.passRate, 0) / gates.length;
  const severityPenalty = severityFromBand(input.readinessRisk);
  const riskScoreBase = passRateMean * 100 - severityPenalty + averageFan;
  const riskScore = Math.max(0, Math.min(100, riskScoreBase + (input.urgency === 'critical' ? 20 : input.urgency === 'urgent' ? 12 : 5)));
  const confidence = classifyConfidenceBand(riskScore, Math.min(1, input.coverage));

  return {
    planId: withBrand(`policy-${Date.now()}`, 'RecoveryForgePlanId'),
    summary: `${confidence} confidence policy for ${input.urgency}`,
    pass: riskScore >= 40 && gates.every((gate) => gate.passRate >= gate.threshold),
    urgency: input.urgency,
    riskScore,
    gates,
  };
};

export const summarizeCoverage = (graph: ForgeGraph): number => {
  if (graph.nodes.length === 0) {
    return 0;
  }

  const nodeDegrees = graph.nodes.map((node) => {
    const degree = graph.edges.filter((edge) => edge.from === node.id || edge.to === node.id).length;
    return degree;
  });

  const total = nodeDegrees.reduce((acc, value) => acc + value, 0);
  const max = Math.max(...nodeDegrees);
  return Number(((total / (graph.nodes.length * Math.max(1, max))) * 100).toFixed(2));
};

export const summarizeTopologies = (report: ForgeExecutionReport): number => {
  return report.topologies.reduce((acc, topology) => acc + topology.nodes.length, 0);
};

export const evaluateReadinessProjection = (riskBand: RiskBand, slaWindow: number): number => {
  const adjusted = severityFromBand(riskBand);
  return Math.max(0, slaWindow - adjusted);
};
