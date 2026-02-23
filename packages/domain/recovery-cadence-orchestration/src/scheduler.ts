import {
  CadenceId,
  CadencePlan,
  CadencePlanSnapshot,
  CadenceWindow,
  CadenceWindowForecast,
  CadenceRisk,
  CadenceConstraint,
} from './types';
import { isActiveState } from './types';

export interface WindowWindowIndex {
  readonly windowId: CadenceWindow['id'];
  readonly startsAt: number;
  readonly endsAt: number;
}

export interface CadenceTimeline {
  readonly planId: CadencePlan['id'];
  readonly points: readonly CadenceWindowForecast[];
}

export interface ChannelHealth {
  readonly channel: string;
  readonly baselineLatencyMs: number;
  readonly riskWeight: number;
}

export const toWindowIndexes = (plan: CadencePlan): WindowWindowIndex[] => {
  return plan.windows
    .map((window) => ({
      windowId: window.id,
      startsAt: Date.parse(window.startAt),
      endsAt: Date.parse(window.endAt),
    }))
    .sort((a, b) => a.startsAt - b.startsAt);
};

export const detectCollisions = (indexes: readonly WindowWindowIndex[]): CadenceWindow['id'][][] => {
  const collisions: CadenceWindow['id'][][] = [];
  for (let i = 0; i < indexes.length; i += 1) {
    const baseline = indexes[i];
    const overlaps: CadenceWindow['id'][] = [];
    for (let j = i + 1; j < indexes.length; j += 1) {
      const candidate = indexes[j];
      if (candidate.startsAt < baseline.endsAt && candidate.endsAt > baseline.startsAt) {
        overlaps.push(candidate.windowId);
      }
    }
    if (overlaps.length > 0) {
      collisions.push([baseline.windowId, ...overlaps]);
    }
  }
  return collisions;
};

export const estimateWindowRisk = (
  window: CadenceWindow,
  constraints: readonly CadenceConstraint[],
  collisions: readonly CadenceWindow['id'][][],
): CadenceRisk => {
  const riskBoost = collisions.some(([windowId]) => windowId === window.id) ? 1 : 0;
  const constraintMultiplier = constraints.some((constraint) => constraint.windowId === window.id) ? 1 : 0;
  const active = isActiveState(window.state) ? 0 : 1;
  const baseScore = window.intensity === 'critical' ? 3 : window.intensity === 'high' ? 2 : window.intensity === 'medium' ? 1 : 0;

  const score = baseScore + riskBoost + constraintMultiplier + active;
  if (score >= 4) return 'critical';
  if (score >= 3) return 'significant';
  if (score >= 2) return 'elevated';
  return 'minimal';
};

export const buildForecast = (
  plan: CadencePlan,
  constraints: readonly CadenceConstraint[],
): CadenceTimeline => {
  const indexes = toWindowIndexes(plan);
  const collisions = detectCollisions(indexes);
  const points = plan.windows.map((window) => {
    const expectedCollisions = collisions
      .filter((bucket) => bucket[0] === window.id)
      .flatMap((bucket) => bucket.slice(1));
    const risk = estimateWindowRisk(window, constraints, collisions);
    const confidence = window.risk === risk ? 0.92 : 0.72;

    return {
      windowId: window.id,
      riskScore: risk === 'critical' ? 0.95 : risk === 'significant' ? 0.72 : risk === 'elevated' ? 0.51 : 0.29,
      confidence,
      projectedStartAt: window.startAt,
      projectedEndAt: window.endAt,
      expectedCollisions,
      remediationHints: expectedCollisions.length > 0 ? ['Review overlap windows', 'Enable staged execution'] : ['No immediate conflicts detected'],
    };
  });

  return {
    planId: plan.id,
    points,
  };
};

export const summarizePlan = (plan: CadencePlan, constraints: readonly CadenceConstraint[]): CadencePlanSnapshot => {
  const timeline = buildForecast(plan, constraints);
  const totalLeadMinutes = plan.windows.reduce((sum, window) => sum + window.leadMinutes, 0);
  const totalLagMinutes = plan.windows.reduce((sum, window) => sum + window.lagMinutes, 0);
  const riskScore = timeline.points.reduce((sum, point) => sum + point.riskScore, 0) / (timeline.points.length || 1);
  const aggregateRisk: CadenceRisk = riskScore > 0.8 ? 'critical' : riskScore > 0.65 ? 'significant' : riskScore > 0.35 ? 'elevated' : 'minimal';

  return {
    planId: plan.id,
    snapshotAt: new Date().toISOString(),
    totalLeadMinutes,
    totalLagMinutes,
    aggregateRisk,
    activeWindowCount: plan.windows.filter((window) => isActiveState(window.state)).length,
    forecast: timeline.points,
  };
};

export const isWindowReadyForActivation = (window: CadenceWindow): boolean => {
  return window.state === 'queued' && window.leadMinutes <= 30 && window.risk !== 'critical';
};

export const deriveCadenceId = (seed: string): CadenceId => `cadence-${seed}` as CadenceId;
