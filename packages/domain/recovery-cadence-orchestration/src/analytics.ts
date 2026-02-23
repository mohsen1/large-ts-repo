import type { CadencePlan, CadenceWindow, CadencePlanSnapshot } from './types';
import { buildForecast, summarizePlan, type CadenceTimeline } from './scheduler';

export interface ChannelUtilization {
  readonly channel: string;
  readonly utilizationPercent: number;
  readonly activeWindows: number;
  readonly queuedWindows: number;
}

export interface PlanVariance {
  readonly planId: CadencePlan['id'];
  readonly meanStartShiftMinutes: number;
  readonly maxStartShiftMinutes: number;
  readonly meanLagShiftMinutes: number;
}

export interface CadenceReport {
  readonly planId: CadencePlan['id'];
  readonly generatedAt: string;
  readonly snapshot: CadencePlanSnapshot;
  readonly utilization: readonly ChannelUtilization[];
  readonly timeline: CadenceTimeline;
  readonly variance: PlanVariance;
}

const msToMinutes = (ms: number): number => Math.round(ms / 60000);

export const calculateUtilization = (plan: CadencePlan): readonly ChannelUtilization[] => {
  const byChannel = new Map<string, { active: number; queued: number }>();
  for (const window of plan.windows) {
    const bucket = byChannel.get(window.channel) ?? { active: 0, queued: 0 };
    if (window.state === 'active') {
      bucket.active += 1;
    }
    if (window.state === 'queued') {
      bucket.queued += 1;
    }
    byChannel.set(window.channel, bucket);
  }

  const totalWindows = Math.max(plan.windows.length, 1);
  return [...byChannel.entries()].map(([channel, bucket]) => ({
    channel,
    activeWindows: bucket.active,
    queuedWindows: bucket.queued,
    utilizationPercent: Number((((bucket.active + bucket.queued) / totalWindows) * 100).toFixed(1)),
  }));
};

const calculateWindowShift = (expected: CadenceWindow, actualStart: string, actualEnd: string): number => {
  const expectedRange = Date.parse(expected.endAt) - Date.parse(expected.startAt);
  const actualRange = Date.parse(actualEnd) - Date.parse(actualStart);
  const shift = Math.abs(actualRange - expectedRange);
  return msToMinutes(shift);
};

export const calculatePlanVariance = (plan: CadencePlan, actuals: readonly CadenceWindow[]): PlanVariance => {
  const shifts: number[] = plan.windows.map((expectedWindow) => {
    const actual = actuals.find((candidate) => candidate.id === expectedWindow.id);
    if (!actual) {
      return 0;
    }
    return calculateWindowShift(expectedWindow, actual.startAt, actual.endAt);
  });

  const total = shifts.reduce((acc, value) => acc + value, 0);
  const meanStartShiftMinutes = total / Math.max(1, shifts.length);
  const maxStartShiftMinutes = Math.max(...shifts, 0);

  const lagShifts = plan.windows.map((expectedWindow) => {
    const actual = actuals.find((candidate) => candidate.id === expectedWindow.id);
    if (!actual) {
      return 0;
    }
    return Math.abs(actual.lagMinutes - expectedWindow.lagMinutes);
  });

  const meanLagShiftMinutes = (lagShifts.reduce((acc, value) => acc + value, 0) / Math.max(1, lagShifts.length));

  return {
    planId: plan.id,
    meanStartShiftMinutes,
    maxStartShiftMinutes,
    meanLagShiftMinutes,
  };
};

export const generateReport = (plan: CadencePlan, actuals: readonly CadenceWindow[]): CadenceReport => {
  const timeline = buildForecast(plan, []);
  const snapshot = summarizePlan(plan, []);
  return {
    planId: plan.id,
    generatedAt: new Date().toISOString(),
    snapshot,
    utilization: calculateUtilization(plan),
    timeline,
    variance: calculatePlanVariance(plan, actuals),
  };
};
