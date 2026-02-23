import { withBrand } from '@shared/core';
import type {
  CommandMetric,
  CommandNode,
  CommandRun,
  CommandSimulation,
  CommandStudioWorkspaceId,
  CommandSimulationStep,
  OrchestrationResult,
} from './types';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import { average, clamp01 } from './utils';

export interface SimulationInput {
  readonly workspaceId: CommandStudioWorkspaceId;
  readonly program: RecoveryProgram;
  readonly run: CommandRun;
  readonly nodes: readonly CommandNode[];
  readonly metrics: readonly CommandMetric[];
}

const commandMetricValue = (node: CommandNode, metrics: readonly CommandMetric[]): number => {
  const nodeMetrics = metrics.filter((metric) => metric.commandId === node.id);
  if (!nodeMetrics.length) return 0.5;
  return clamp01(
    average(
      nodeMetrics.map((entry) => {
        if (entry.unit === 'percent') return entry.value / 100;
        if (entry.unit === 'ms') return Math.max(0, 1 - entry.value / 120_000);
        return Math.max(0, 1 - entry.value / 100);
      }),
    ),
  );
};

const estimateDurationMs = (score: number, commandCount: number): number => {
  const base = 45_000;
  const multiplier = 1 + (1 - score) * 1.8;
  const sized = base * commandCount * multiplier;
  return Math.max(1_000, Math.round(sized / 3));
};

export const buildSimulationSteps = (
  nodes: readonly CommandNode[],
  metrics: readonly CommandMetric[],
): readonly CommandSimulationStep[] => {
  let currentMs = Date.now();
  const steps: CommandSimulationStep[] = [];

  for (const [index, node] of nodes.entries()) {
    const quality = commandMetricValue(node, metrics);
    const duration = estimateDurationMs(quality, node.commands.length + 1);
    const expectedStart = new Date(currentMs).toISOString();
    currentMs += duration;
    const expectedFinish = new Date(currentMs).toISOString();

    const blockers = [] as string[];
    if (node.commands.includes('approve')) {
      blockers.push(`Manual approval required for ${node.stepId}`);
    }
    if (node.step.requiredApprovals > 0) {
      blockers.push(`Operator approvals: ${node.step.requiredApprovals}`);
    }

    steps.push({
      index,
      commandId: node.id,
      expectedStart,
      expectedFinish,
      metrics: [
        {
          metricId: withBrand(`${node.id}-duration`, 'MetricId'),
          commandId: node.id,
          label: 'estimatedDurationMs',
          value: duration,
          unit: 'ms',
        },
        {
          metricId: withBrand(`${node.id}-quality`, 'MetricId'),
          commandId: node.id,
          label: 'quality',
          value: Math.round(quality * 10000) / 100,
          unit: 'percent',
        },
      ],
      blockers,
    });
  }

  return steps;
};

const deriveOutcome = (steps: readonly CommandSimulationStep[], program: RecoveryProgram): OrchestrationResult => {
  const criticalScore = steps.reduce((acc, step) => {
    const durationPenalty = Math.max(0, step.index - program.steps.length) / Math.max(1, program.steps.length);
    const blockerPenalty = step.blockers.length * 0.08;
    return acc + (1 - blockerPenalty) * (1 - durationPenalty);
  }, 0);

  const qualityScores = steps
    .map((step) => step.metrics.find((metric) => metric.label === 'quality')?.value ?? 0)
    .map((raw) => clamp01(raw / 100));

  const quality = qualityScores.length ? average(qualityScores) : 0;
  const confidence = clamp01((criticalScore / Math.max(1, steps.length)) * 0.8 + quality * 0.2);

  return {
    ok: confidence > 0.62,
    warningCount: steps.filter((step) => step.blockers.length > 1).length,
    estimatedMinutes: Math.max(1, Math.round(steps.reduce((acc, step) => acc + step.metrics[0].value, 0) / 60_000)),
    confidence,
  };
};

export const runSimulation = ({ workspaceId, run, nodes, metrics, program }: SimulationInput): CommandSimulation => {
  void workspaceId;
  const steps = buildSimulationSteps(nodes, metrics);
  const outcome = deriveOutcome(steps, program);
  const horizonMs = steps.reduce((acc, step) => {
    const finish = Date.parse(step.expectedFinish);
    const start = Date.parse(step.expectedStart);
    return acc + Math.max(0, finish - start);
  }, 0);

  return {
    simulationId: withBrand(`${run.runId}-sim-${run.sequenceId}`, 'SimulationId'),
    sequenceId: run.sequenceId,
    createdAt: new Date().toISOString(),
    steps,
    horizonMs,
    outcome,
  };
};

export const runBatchSimulations = (
  input: SimulationInput,
  attempts: number,
): readonly CommandSimulation[] => {
  const requested = Math.max(1, Math.min(5, attempts));
  const outputs = [] as CommandSimulation[];

  for (let attempt = 0; attempt < requested; attempt += 1) {
    const simulation = runSimulation(input);
    outputs.push(simulation);
  }

  return outputs;
};

export const latestSimulation = (simulations: readonly CommandSimulation[]): CommandSimulation | undefined =>
  simulations.reduce<CommandSimulation | undefined>((best, next) => {
    if (!best) return next;
    return Date.parse(next.createdAt) >= Date.parse(best.createdAt) ? next : best;
  }, undefined);
