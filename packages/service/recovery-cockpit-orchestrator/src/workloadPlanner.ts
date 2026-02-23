import { RecoveryPlan } from '@domain/recovery-cockpit-models';
import { buildReadinessProfile, isAboveThreshold } from '@domain/recovery-cockpit-workloads';
import { estimateExecutionWindows, computeSlots, isReadyByGate } from '@domain/recovery-cockpit-workloads';
import { buildTopologySnapshot } from '@domain/recovery-cockpit-workloads';

export type WorkloadPlanSummary = {
  readonly planId: string;
  readonly gateOk: boolean;
  readonly slotCount: number;
  readonly forecastWindows: number;
  readonly readinessScore: number;
};

export const summarizeWorkloadReadiness = (plan: RecoveryPlan): WorkloadPlanSummary => {
  const readiness = buildReadinessProfile(plan);
  const gates = isReadyByGate(plan);
  const slots = computeSlots(plan, 2);
  const topology = buildTopologySnapshot(plan);
  return {
    planId: plan.planId,
    gateOk: gates.every((gate) => gate.accepted),
    slotCount: slots.length,
    forecastWindows: topology.edges.length,
    readinessScore: readiness.mean,
  };
};

export const estimateCapacityUtilization = (plan: RecoveryPlan): ReadonlyArray<{ actionId: string; predictedFinish: string }> => {
  const windows = estimateExecutionWindows(plan, Date.now(), 2);
  return windows.map((window) => ({
    actionId: window.actionId,
    predictedFinish: window.predictedFinish,
  }));
};

export const findBottleneck = (plan: RecoveryPlan): ReadonlyArray<string> => {
  const topology = buildTopologySnapshot(plan);
  return topology.orderedByCriticality.slice(0, 3);
};

export const isPlanHealthy = (plan: RecoveryPlan): boolean => {
  const readiness = buildReadinessProfile(plan);
  return isAboveThreshold(readiness);
};
