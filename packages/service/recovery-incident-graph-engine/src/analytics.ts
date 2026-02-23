import type { EngineResponse } from './types';

export interface EngineAnalytics {
  readonly requestId: string;
  readonly readinessDelta: number;
  readonly riskScore: number;
  readonly failureRate: number;
  readonly criticalNodes: number;
  readonly signalCount: number;
}

const toPercent = (value: number): number => Number((value * 100).toFixed(2));

const safeDivide = (left: number, right: number): number => {
  if (right <= 0) return 0;
  return left / right;
};

export const computeEngineAnalytics = (response: EngineResponse): EngineAnalytics => {
  const totalNodes = Math.max(1, response.simulation.summary.completedNodeCount + response.simulation.summary.failedNodeCount);
  const completed = response.simulation.summary.completedNodeCount;
  const failed = response.simulation.summary.failedNodeCount;
  const warnings = response.simulation.summary.warningNodeCount;

  return {
    requestId: response.requestId,
    readinessDelta: response.summary.readinessImprovement,
    riskScore: toPercent(safeDivide(completed + warnings, totalNodes)),
    failureRate: toPercent(safeDivide(failed, totalNodes)),
    criticalNodes: response.plan.plan.instructions.filter((instruction) => instruction.risks.red > 0.5).length,
    signalCount: response.simulation.summary.triggeredSignals.length,
  };
};

export const compareAnalytics = (left: EngineAnalytics, right: EngineAnalytics): EngineAnalytics => ({
  requestId: `${left.requestId}|${right.requestId}`,
  readinessDelta: right.readinessDelta - left.readinessDelta,
  riskScore: toPercent((left.riskScore + right.riskScore) / 200),
  failureRate: toPercent((left.failureRate + right.failureRate) / 2 / 100),
  criticalNodes: Math.max(left.criticalNodes, right.criticalNodes),
  signalCount: left.signalCount + right.signalCount,
});

export const formatAnalytics = (analytics: EngineAnalytics): string => {
  return `request=${analytics.requestId} | readiness=${analytics.readinessDelta} | risk=${analytics.riskScore} | failure=${analytics.failureRate} | critical=${analytics.criticalNodes} | signals=${analytics.signalCount}`;
};
