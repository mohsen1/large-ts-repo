import { type FailureActionPlan, type FailureSignal } from '@domain/failure-intelligence';
import { type StoreQuery } from './validators';

export interface QueryMatch {
  signal: FailureSignal;
  matchingScore: number;
}

export interface PlanQueryResult {
  plan: FailureActionPlan;
  state: 'active' | 'expired';
  createdAgeMs: number;
}

export const querySignals = (signals: readonly FailureSignal[], query: StoreQuery): FailureSignal[] => {
  const from = new Date(query.from).toISOString();
  const to = new Date(query.to).toISOString();

  return signals
    .filter((signal) => signal.tenantId === query.tenantId)
    .filter((signal) => signal.createdAt >= from && signal.createdAt <= to)
    .filter((signal) => (query.shape ? signal.shape === query.shape : true))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
    .slice(0, query.limit);
};

const scoreSignal = (signal: FailureSignal, query: StoreQuery): QueryMatch => {
  const shapeMatch = query.shape ? (signal.shape === query.shape ? 0.65 : 0.2) : 0.4;
  const freshness = Math.max(0, 1 - (Date.now() - Date.parse(signal.createdAt)) / (24 * 60 * 60_000));
  return {
    signal,
    matchingScore: Math.min(1, shapeMatch + freshness * 0.4),
  };
};

export const rankedSignals = (signals: readonly FailureSignal[], query: StoreQuery): QueryMatch[] => {
  return signals
    .map((signal) => scoreSignal(signal, query))
    .sort((left, right) => right.matchingScore - left.matchingScore);
};

export const summarizeQueries = (plans: readonly PlanQueryResult[]): string => {
  return plans.map((entry) => `${entry.plan.id}:${entry.state}:${entry.createdAgeMs}`).join(' | ');
};
