import type {
  ExperimentPlan,
  ExperimentPhase,
  ExperimentNode,
  RuntimeResult,
  RuntimeEvent,
} from './types';

export interface PlanSignal {
  readonly phase: ExperimentPhase;
  readonly nodeCount: number;
  readonly avgScore: number;
}

export interface PlanOverview {
  readonly planId: string;
  readonly tenant: string;
  readonly phaseCount: number;
  readonly nodeCount: number;
  readonly weightedScore: number;
  readonly phases: readonly PlanSignal[];
}

export interface RuntimeOverview {
  readonly runId: string;
  readonly complete: boolean;
  readonly phases: readonly ExperimentPhase[];
  readonly stateSequence: readonly number[];
}

const computePhaseSignals = (graph: readonly ExperimentNode[]): Map<ExperimentPhase, { count: number; score: number }> => {
  const signal = new Map<ExperimentPhase, { count: number; score: number }>();
  for (const node of graph) {
    const current = signal.get(node.phase) ?? { count: 0, score: 0 };
    signal.set(node.phase, {
      count: current.count + 1,
      score: current.score + node.score,
    });
  }
  return signal;
};

export const buildPlanOverview = (plan: ExperimentPlan): PlanOverview => {
  const phaseSignals = computePhaseSignals(plan.graph);
  const signals = [...phaseSignals.entries()].map(([phase, data]) => ({
    phase,
    nodeCount: data.count,
    avgScore: data.count ? Number((data.score / data.count).toFixed(2)) : 0,
  }));

  const weightedScore = signals.reduce((acc, signal) => acc + signal.avgScore, 0);

  return {
    planId: plan.planId,
    tenant: plan.tenant,
    phaseCount: plan.sequence.length,
    nodeCount: plan.graph.length,
    weightedScore,
    phases: signals,
  };
};

export const buildStateOverview = (results: readonly RuntimeResult[]): RuntimeOverview => {
  const events: readonly RuntimeEvent[] = results.flatMap((result) => result.outputs);
  return {
    runId: results.at(-1)?.runId ?? 'unknown',
    complete: results.every((result) => result.state.complete),
    phases: events.map((event) => event.phase),
    stateSequence: events.map((event, index) => index),
  };
};

export const summarizeSignals = (plan: ExperimentPlan): string => {
  const overview = buildPlanOverview(plan);
  const topSignals = overview.phases.map((signal) => `${signal.phase}:${signal.nodeCount}`);
  return `${overview.planId} :: ${topSignals.join(' | ')}`;
};
