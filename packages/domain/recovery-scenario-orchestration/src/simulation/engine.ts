import { clamp } from '@shared/util';
import type { RecoveryPlan, RecoveryRun, RecoverySignal, ConstraintSnapshot, ScenarioAction } from '../types';
import { buildExecutionWindows } from '../scheduler';
import { summarizeConstraintRisk } from '../analytics/riskAssessment';

export interface SimulationInput {
  readonly plan: RecoveryPlan;
  readonly signals: readonly RecoverySignal[];
  readonly snapshots: readonly ConstraintSnapshot[];
  readonly seed: number;
  readonly durationMinutes: number;
}

export interface SimulationEvent {
  readonly planId: RecoveryPlan['id'];
  readonly order: number;
  readonly runId: RecoveryRun['id'];
  readonly actionId: ScenarioAction['id'];
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly success: boolean;
}

export interface SimulationResult {
  readonly planId: RecoveryPlan['id'];
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMinutes: number;
  readonly overallConfidence: number;
  readonly events: readonly SimulationEvent[];
  readonly riskScore: number;
}

interface LcgState {
  readonly seed: number;
}

const createLCG = (seed: number): (() => number) => {
  let state = seed % 2147483647;
  if (state <= 0) {
    state += 2147483646;
  }
  return () => {
    state = (state * 48271) % 2147483647;
    return state / 2147483647;
  };
};

const toRunId = (plan: RecoveryPlan, actionId: string): RecoveryRun['id'] => `${plan.id}:${actionId}` as RecoveryRun['id'];

const buildEvents = (
  plan: RecoveryPlan,
  snapshots: readonly ConstraintSnapshot[],
  random: () => number,
  start: string,
): readonly SimulationEvent[] => {
  const windows = buildExecutionWindows(plan, snapshots);
  const risk = summarizeConstraintRisk(snapshots, plan);
  const blocks = risk.blockedCount;

  return windows.map((window, index) => {
    const jitter = Math.floor(random() * 7) - 3;
    const startedAt = new Date(Date.parse(window.window.earliestAt) + index * 1000 + jitter * 1000).toISOString();
    const duration = window.action.estimatedMinutes * 60_000;
    const finished = new Date(Date.parse(window.window.latestAt) + duration + jitter * 1000).toISOString();
    const failureChance = clamp(0.15 + blocks * 0.1 + index * 0.02, 0, 0.9);
    const success = random() > failureChance;
    return {
      planId: plan.id,
      order: index,
      runId: toRunId(plan, String(window.action.id)),
      actionId: window.action.id,
      startedAt,
      finishedAt: finished,
      success,
    };
  });
};

const simulateClock = (start: string, minutes: number): string =>
  new Date(Date.parse(start) + minutes * 60_000).toISOString();

export const simulateRecoveryFlow = (input: SimulationInput): SimulationResult => {
  const random = createLCG(input.seed);
  const startedAt = new Date().toISOString();
  const events = buildEvents(input.plan, input.snapshots, random, startedAt);
  const overallConfidence =
    summarizeConstraintRisk(input.snapshots, input.plan).score / 100 * (input.durationMinutes / Math.max(1, input.signals.length || 1));
  const durationMinutes = clamp(input.durationMinutes, 1, 365) * (events.length || 1);
  const finishedAt = simulateClock(startedAt, durationMinutes);

  return {
    planId: input.plan.id,
    startedAt,
    finishedAt,
    durationMinutes,
    overallConfidence,
    events,
    riskScore: summarizeConstraintRisk(input.snapshots, input.plan).score,
  };
};

export const batchSimulations = (
  plan: RecoveryPlan,
  snapshots: readonly ConstraintSnapshot[],
  signals: readonly RecoverySignal[],
  count: number,
): readonly SimulationResult[] => {
  const total = clamp(count, 1, 20);
  const baseSeed = Math.max(1, snapshots.length + signals.length + plan.actions.length);
  const outputs: SimulationResult[] = [];

  for (let i = 0; i < total; i += 1) {
    const duration = Math.max(1, 5 + (i % 12));
    outputs.push(simulateRecoveryFlow({ plan, signals, snapshots, seed: baseSeed + i, durationMinutes: duration }));
  }

  return outputs;
};
