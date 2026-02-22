import type { Brand } from '@shared/core';

import type { RecoverySignal, RecoveryConstraintBudget, RunPlanSnapshot, SessionDecision } from './types';

export type OrchestrationState = 'idle' | 'simulating' | 'staging' | 'ready' | 'blocked';

export interface SimulationLane {
  readonly id: Brand<string, 'LaneId'>;
  readonly name: string;
  readonly dependencyIndexes: readonly number[];
  readonly expectedDelayMs: number;
}

export interface SimulationProgram {
  readonly sessionId: string;
  readonly plan: RunPlanSnapshot['id'];
  readonly lanes: readonly SimulationLane[];
  readonly signalDigest: string;
  readonly signalCount: number;
  readonly estimatedDurationMs: number;
  readonly budget: RecoveryConstraintBudget;
}

export interface SimulationWindow {
  readonly windowStart: string;
  readonly windowEnd: string;
  readonly timezone: string;
}

export interface OrchestrationPlan {
  readonly id: Brand<string, 'OrchestrationPlanId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly sessionId: string;
  readonly candidate: RunPlanSnapshot;
  readonly state: OrchestrationState;
  readonly window: SimulationWindow;
  readonly decisionHistory: readonly SessionDecision[];
  readonly signalDensity: readonly number[];
  readonly lanes: readonly SimulationLane[];
  readonly estimatedSeconds: number;
}

export interface OrchestrationSnapshot {
  readonly runId: RunPlanSnapshot['id'];
  readonly createdAt: string;
  readonly state: OrchestrationState;
  readonly summary: string;
  readonly riskLevel: number;
  readonly lanes: number;
  readonly signalCount: number;
  readonly averageLatencyMs: number;
}

export interface OrchestrationSignalDigest {
  readonly category: 'high' | 'normal' | 'low';
  readonly score: number;
  readonly topSignals: readonly RecoverySignal[];
}

const estimateDelay = (index: number, signalCount: number, budget: RecoveryConstraintBudget): number => {
  const base = Math.max(1, budget.maxParallelism);
  const pressure = Math.max(1, signalCount / Math.max(1, budget.maxRetries));
  return Math.round((index + 1) * 100 * pressure / base + budget.timeoutMinutes * 10);
};

const estimateDuration = (lanes: readonly SimulationLane[], signalCount: number): number => {
  if (lanes.length === 0) return 0;
  const sum = lanes.reduce((acc, lane) => acc + lane.expectedDelayMs, 0);
  const avg = sum / lanes.length;
  const amplification = 1 + signalCount / 100;
  return Math.round(avg * amplification + 500);
};

const topSignals = (signals: readonly RecoverySignal[]): OrchestrationSignalDigest => {
  const high = signals.filter((signal) => signal.severity >= 8);
  const low = signals.filter((signal) => signal.severity < 4);

  if (high.length >= low.length && high.length > 3) {
    return {
      category: 'high',
      score: Math.min(1, high.length / (signals.length || 1)),
      topSignals: high.slice(0, 5),
    };
  }

  return {
    category: low.length > Math.max(1, high.length) ? 'low' : 'normal',
    score: Math.min(1, signals.reduce((acc, signal) => acc + signal.severity, 0) / (signals.length * 10)),
    topSignals: signals.slice(0, 5),
  };
};

export const buildSimulationProgram = (
  plan: RunPlanSnapshot,
  signals: readonly RecoverySignal[],
  budget: RecoveryConstraintBudget,
): SimulationProgram => {
  const signalDigest = `${signals.length}:${signals.filter((signal) => signal.severity >= 7).length}`;
  const lanes = plan.program.steps.map((step, index) => ({
    id: `lane-${index}-${plan.id}` as Brand<string, 'LaneId'>,
    name: step.title,
    dependencyIndexes: step.dependencies.map((dependency) => Number.parseInt(dependency.replace(/[^0-9]/g, ''), 10) || 0),
    expectedDelayMs: estimateDelay(index, signals.length, budget),
  }));
  const signalCount = signals.length;
  const estimatedDurationMs = estimateDuration(lanes, signalCount);

  return {
    sessionId: String(plan.id),
    plan: plan.id,
    lanes,
    signalDigest,
    signalCount,
    estimatedDurationMs,
    budget,
  };
};

export const buildOrchestrationPlan = (
  tenant: Brand<string, 'TenantId'>,
  plan: RunPlanSnapshot,
  signals: readonly RecoverySignal[],
  decisionHistory: readonly SessionDecision[],
  budget: RecoveryConstraintBudget,
): OrchestrationPlan => {
  const simulation = buildSimulationProgram(plan, signals, budget);
  const riskSignals = topSignals(signals);
  const estimatedSeconds = Math.max(1, Math.round(simulation.estimatedDurationMs / 1000));
  const signalDensity = signals.map((signal) => signal.severity);

  return {
    id: `orch-${tenant}-${plan.id}` as Brand<string, 'OrchestrationPlanId'>,
    tenant,
    sessionId: String(plan.id),
    candidate: {
      ...plan,
      sourceSessionId: undefined,
      effectiveAt: new Date().toISOString(),
    },
    state: riskSignals.category === 'high' ? 'blocked' : riskSignals.score >= 0.7 ? 'ready' : 'staging',
    window: {
      windowStart: new Date().toISOString(),
      windowEnd: new Date(Date.now() + estimatedSeconds * 1000).toISOString(),
      timezone: 'UTC',
    },
    decisionHistory: [...decisionHistory],
    signalDensity,
    lanes: simulation.lanes,
    estimatedSeconds,
  };
};

export const snapshotFromPlan = (plan: OrchestrationPlan): OrchestrationSnapshot => {
  const avgSignalSeverity = plan.signalDensity.length === 0
    ? 0
    : plan.signalDensity.reduce((acc, value) => acc + value, 0) / plan.signalDensity.length;
  const riskLevel = Math.round(Math.min(1, avgSignalSeverity / 10) * 100);
  return {
    runId: plan.candidate.id,
    createdAt: plan.window.windowStart,
    state: plan.state,
    summary: `${plan.lanes.length} lanes, ${plan.signalDensity.length} signals`,
    riskLevel,
    lanes: plan.lanes.length,
    signalCount: plan.signalDensity.length,
    averageLatencyMs: plan.estimatedSeconds * 20,
  };
};

export const canRunPlan = (plan: OrchestrationPlan): boolean => {
  if (plan.state === 'blocked') return false;
  if (plan.candidate.constraints.operatorApprovalRequired) return false;
  if (plan.estimatedSeconds <= 0) return false;
  if (plan.estimatedSeconds > plan.candidate.constraints.timeoutMinutes * 60) return false;
  return true;
};

export const prioritizeOrchestrationPlans = (
  plans: readonly OrchestrationPlan[],
): readonly OrchestrationPlan[] => {
  return [...plans].sort((left, right) => {
    const leftRisk = left.candidate.constraints.maxParallelism + left.candidate.constraints.maxRetries;
    const rightRisk = right.candidate.constraints.maxParallelism + right.candidate.constraints.maxRetries;
    if (left.state !== right.state) {
      return left.state === 'ready' ? -1 : right.state === 'ready' ? 1 : 0;
    }
    if (leftRisk !== rightRisk) {
      return rightRisk - leftRisk;
    }
    return left.estimatedSeconds - right.estimatedSeconds;
  });
};
