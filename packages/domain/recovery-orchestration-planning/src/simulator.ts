import type {
  StrategyTemplate,
  StrategyRun,
  StrategyStepNode,
  StrategySimulationWindow,
  StrategyPlan,
  SimulationSummary,
  StrategyPolicy,
} from './types';
import { buildTopology } from './graph';
import { classifyPosture, describeSimulationWindows, calculatePlanScore, summarizeByPosture } from './policy';

export interface SimulationConfig {
  readonly run: StrategyRun;
  readonly stepWindowMinutes: number;
  readonly includeWaiting: boolean;
  readonly riskSamples: readonly number[];
  readonly policy: StrategyPolicy;
}

export interface SimulatedStep {
  readonly step: StrategyStepNode;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly estimatedRisk: number;
  readonly phase: StrategyStepNode['phase'];
}

export interface SimulationOutput {
  readonly plan: StrategyPlan;
  readonly summary: SimulationSummary;
  readonly timeline: readonly SimulatedStep[];
  readonly notes: readonly string[];
  readonly score: number;
}

const postureFromSignal = (signal: number) => {
  if (signal >= 0.8) return 'critical';
  if (signal >= 0.6) return 'high';
  if (signal >= 0.3) return 'medium';
  return 'low';
};

const makeTimeline = (steps: readonly StrategyStepNode[], stepWindowMinutes: number): readonly SimulatedStep[] => {
  const topology = buildTopology(steps, []);
  let clock = 0;
  const timeline: SimulatedStep[] = [];

  for (const stepId of topology.order) {
    const step = steps.find((value) => value.stepId === stepId);
    if (!step) {
      continue;
    }

    const startMinute = clock;
    const duration = Math.max(1, step.command.estimatedMinutes);
    clock += duration;

    timeline.push({
      step,
      startMinute,
      endMinute: startMinute + duration,
      estimatedRisk: Math.max(0, 1 - step.expectedRiskReduction),
      phase: step.phase,
    });

    clock += stepWindowMinutes * Math.max(1, step.maxParallelism);
  }

  return timeline;
};

export const simulateStrategy = (template: StrategyTemplate, config: SimulationConfig): SimulationOutput => {
  const windows: StrategySimulationWindow[] = template.steps.map((step, index) => {
    const signal = config.riskSamples[index % Math.max(1, config.riskSamples.length)] ?? 0;
    return {
      minuteOffset: index * 5,
      riskPosture: postureFromSignal(signal),
      expectedRto: Math.max(1, (index + 1) * 6 - step.maxParallelism),
      commandCount: step.command.estimatedMinutes,
      signalDensity: signal,
    };
  });

  const timeline = makeTimeline(template.steps, config.stepWindowMinutes);
  const plan: StrategyPlan = {
    strategyId: template.templateId,
    templateId: template.templateId,
    draftId: `draft-${template.templateId}`,
    runbookTokens: template.steps.map((step) => step.command.token),
    windows,
    dependencies: template.dependencies,
    executionPriority: timeline.map((entry) => entry.step.stepId),
  };

  const posture = classifyPosture(windows.map((window) => window.signalDensity));
  const score = calculatePlanScore(plan, posture, config.policy);
  const top = Object.entries(summarizeByPosture(plan))
    .map(([key, value]) => `${key}:${value.toFixed(2)}`)
    .join(' | ');

  return {
    plan,
    summary: {
      planId: template.templateId,
      scenarioCount: windows.length,
      averageRiskPosture: posture,
      projectedRecoveryMinutes: timeline.reduce((sum, step) => sum + (step.endMinute - step.startMinute), 0),
      commandDensity: windows.length === 0 ? 0 : config.riskSamples.length / windows.length,
      topRiskSteps: timeline.map((entry) => entry.step.stepId),
    },
    timeline,
    notes: [
      `score=${score}`,
      `posture=${posture}`,
      `parallelPolicy=${config.policy.maxParallelism}`,
      top,
      `includeWaiting=${config.includeWaiting}`,
      ...describeSimulationWindows(windows),
    ],
    score,
  };
};

export const timelineByPhase = (output: SimulationOutput): Readonly<Record<string, readonly SimulatedStep[]>> => {
  const grouped = output.timeline.reduce<Record<string, SimulatedStep[]>>((acc, step) => {
    const phase = step.phase;
    acc[phase] = [...(acc[phase] ?? []), step];
    return acc;
  }, {});

  return grouped;
};

export const selectWindow = (output: SimulationOutput, index: number): StrategySimulationWindow | undefined => {
  return output.plan.windows[index] ?? undefined;
};
