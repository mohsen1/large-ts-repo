import { withBrand } from '@shared/core';
import type { CommandSequence, CommandSimulation, CommandWindowState, CommandStudioWorkspaceId } from './types';
import { average, buildThroughput, clamp01 } from './utils';

export interface ReadinessPlan {
  readonly workspaceId: CommandStudioWorkspaceId;
  readonly baselineScore: number;
  readonly plannedFor: string;
  readonly steps: readonly {
    readonly commandId: string;
    readonly order: number;
    readonly expectedDelayMs: number;
  }[];
}

export interface PlanAdvice {
  readonly severity: 'info' | 'warning' | 'critical';
  readonly reason: string;
  readonly action: string;
}

export interface OrchestrationPlanResult {
  readonly sequence: CommandSequence;
  readonly readinessPlan: ReadinessPlan;
  readonly advice: readonly PlanAdvice[];
}

const stepDelay = (index: number, baselineScore: number, throughput: number): number => {
  const risk = 1 - clamp01(baselineScore);
  const baseMs = 30_000 + index * 10_000;
  const throughputFactor = 1 / Math.max(0.4, throughput + 0.1);
  return Math.max(1_000, Math.round(baseMs * (1 + risk) * throughputFactor));
};

export const buildReadinessPlan = (workspaceId: CommandStudioWorkspaceId, sequence: CommandSequence): ReadinessPlan => {
  const throughput = average(sequence.nodes.map((node) => node.commands.length));
  const baselineScore = sequence.readinessScore;

  const steps = sequence.nodes.map((node, index) => ({
    commandId: node.id,
    order: index,
    expectedDelayMs: stepDelay(index, baselineScore, throughput),
  }));

  return {
    workspaceId,
    baselineScore,
    plannedFor: new Date().toISOString(),
    steps,
  };
};

export const validateSequenceDependencies = (sequence: CommandSequence): readonly string[] => {
  const missing = new Set<string>();
  const nodeIds = new Set(sequence.nodes.map((node) => node.id));

  for (const node of sequence.nodes) {
    for (const dependency of node.step.dependencies) {
      if (!nodeIds.has(withBrand(dependency, 'CommandStudioCommandId'))) {
        missing.add(dependency);
      }
    }
  }

  return [...missing];
};

const evaluateRisk = (sequence: CommandSequence, throughput: number, completionRatio: number): number => {
  const baseRisk = sequence.risk;
  const penaltyForSize = Math.min(1, sequence.nodes.length / 20);
  const readinessPenalty = 1 - sequence.readinessScore;
  return clamp01(baseRisk * (1 - throughput) * 0.7 + penaltyForSize * 0.2 + readinessPenalty * 0.1 + completionRatio * 0.05);
};

export const makeAdvice = (sequence: CommandSequence): readonly PlanAdvice[] => {
  const completion = buildThroughput(sequence.nodes, []);
  const risk = evaluateRisk(sequence, completion, sequence.nodes.length / Math.max(1, sequence.nodes.length));

  const warnings: PlanAdvice[] = [];
  if (sequence.risk > 0.7) {
    warnings.push({
      severity: 'critical',
      reason: `Critical risk detected for sequence ${sequence.name}`,
      action: 'Split execution into two windows and enforce approval gates.',
    });
  }

  if (sequence.nodes.length > 12) {
    warnings.push({
      severity: 'warning',
      reason: `Sequence length ${sequence.nodes.length} may exceed window limits`,
      action: 'Re-order by dependency depth and reduce concurrent in-flight count.',
    });
  }

  if (completion < 0.2) {
    warnings.push({
      severity: 'warning',
      reason: 'Low expected completion throughput due to limited lane utilization',
      action: 'Increase lane capacity or redistribute nodes by criticality.',
    });
  }

  if (risk > 0.9) {
    warnings.push({
      severity: 'critical',
      reason: 'Confidence and readiness mismatch indicate unstable simulation surface',
      action: 'Pause dispatch and request additional signal signals from observability channels.',
    });
  }

  if (!warnings.length) {
    warnings.push({
      severity: 'info',
      reason: 'Sequence is stable under current constraints',
      action: 'Continue with automated dispatch and monitor metrics.',
    });
  }

  return warnings;
};

export const synthesizePlan = (sequence: CommandSequence): OrchestrationPlanResult => {
  const readinessPlan = buildReadinessPlan(withBrand(sequence.workspaceId, 'CommandStudioWorkspaceId'), sequence);
  const advice = makeAdvice(sequence);
  return { sequence, readinessPlan, advice };
};

export const predictTerminalState = (sequence: CommandSequence, simulations: readonly CommandSimulation[]): CommandWindowState => {
  const matched = simulations.find((simulation) => simulation.sequenceId === sequence.sequenceId);
  if (!matched) return 'draft';
  if (!matched.outcome.ok) return 'failed';
  if (matched.outcome.confidence < 0.6) return 'suspended';
  return 'queued';
};
