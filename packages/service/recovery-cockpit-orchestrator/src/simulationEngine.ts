import { RecoveryAction, RecoveryPlan, CommandEvent } from '@domain/recovery-cockpit-models';
import { summarizeStrategy, buildExecutionStrategy, ExecutionStrategy } from './strategy';
import { estimateExecutionWindows } from '@domain/recovery-cockpit-workloads';
import { collectTelemetrySnapshot } from './analyticsEngine';
import { InMemoryCockpitStore } from '@data/recovery-cockpit-store';

export type SimulationTrace = {
  readonly planId: string;
  readonly strategy: ExecutionStrategy;
  readonly timeline: readonly { at: string; actionId: string; etaMinutes: number }[];
  readonly risk: number;
  readonly projectedReadiness: number;
};

type SimulationStep = {
  readonly actionId: string;
  readonly expectedDurationMinutes: number;
  readonly status: CommandEvent['status'];
};

export type SimulationComparison = {
  readonly strategies: readonly SimulationTrace[];
  readonly winner: ExecutionStrategy;
  readonly rationale: string;
};

const calculateRisk = (plan: RecoveryPlan): number => {
  const unsafeDependencies = plan.actions.reduce((acc, action) => acc + action.dependencies.length, 0);
  return Math.min(100, plan.actions.length * 2 + unsafeDependencies);
};

const projection = async (
  store: InMemoryCockpitStore,
  strategy: ExecutionStrategy,
  plan: RecoveryPlan,
): Promise<SimulationTrace> => {
  const strategyPlan = buildExecutionStrategy(plan, strategy);
  const windows = estimateExecutionWindows(
    plan,
    Date.now(),
    strategy === 'critical-first' ? 1 : 2,
  );

  const snapshot = await collectTelemetrySnapshot(store, plan);
  const risk = calculateRisk(plan) + strategyPlan.stages.length;
  return {
    planId: plan.planId,
    strategy,
    timeline: windows.map((window) => ({
      at: window.at,
      actionId: window.actionId,
      etaMinutes: Math.max(1, Math.round((new Date(window.predictedFinish).getTime() - Date.now()) / 60000)),
    })),
    risk,
    projectedReadiness: snapshot.eventDensity + strategyPlan.estimatedMinutes,
  };
};

export const compareSimulationStrategies = async (
  store: InMemoryCockpitStore,
  plan: RecoveryPlan,
): Promise<SimulationComparison> => {
  const strategies: ExecutionStrategy[] = ['fastest-first', 'critical-first', 'dependency-first', 'balanced'];
  const traces = await Promise.all(strategies.map((strategy) => projection(store, strategy, plan)));
  const sorted = [...traces].sort((left, right) => left.timeline.length - right.timeline.length);
  const winner = sorted[0]?.strategy ?? 'balanced';
  return {
    strategies: traces,
    winner,
    rationale: summarizeStrategy(plan, buildExecutionStrategy(plan, winner)),
  };
};

export const simulatePlanActions = (actions: readonly RecoveryAction[]): readonly SimulationStep[] => {
  return actions
    .slice()
    .sort((left, right) => left.expectedDurationMinutes - right.expectedDurationMinutes)
    .map((action, index) => ({
      actionId: action.id,
      expectedDurationMinutes: action.expectedDurationMinutes,
      status: index % 3 === 0 ? 'active' : index % 2 === 0 ? 'queued' : 'completed',
    }));
};
