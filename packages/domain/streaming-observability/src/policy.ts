import { StreamTopologyAlert, StreamHealthSignal, StreamHealthLevel } from './types';

export interface HealthPolicy {
  id: string;
  name: string;
  limitCriticalSignals: number;
  criticalToWarningRatio: number;
}

export interface PolicyContext {
  alerts: StreamTopologyAlert[];
  signals: StreamHealthSignal[];
}

export interface PolicyDecision {
  policyId: string;
  severity: StreamHealthLevel;
  requiresEscalation: boolean;
  rationale: string[];
}

const defaultPolicy: HealthPolicy = {
  id: 'streaming-default',
  name: 'default-stream-policy',
  limitCriticalSignals: 1,
  criticalToWarningRatio: 2,
};

export const evaluatePolicy = (policy: HealthPolicy, context: PolicyContext): PolicyDecision => {
  const criticalCount = context.signals.filter((signal) => signal.level === 'critical').length;
  const warningCount = context.signals.filter((signal) => signal.level === 'warning').length;
  const riskRatio = warningCount === 0 ? 0 : criticalCount / warningCount;
  const topologyRisk = context.alerts.filter((alert) => alert.severity >= 4).length;
  const rationale: string[] = [];
  if (criticalCount > policy.limitCriticalSignals) {
    rationale.push('critical signal count exceeded policy limit');
  }
  if (riskRatio > policy.criticalToWarningRatio) {
    rationale.push('high critical-to-warning ratio');
  }
  if (topologyRisk > 2) {
    rationale.push('topology risk increased due to critical alerts');
  }
  const requiresEscalation = rationale.length > 0 || context.signals.some((signal) => signal.level === 'critical');
  return {
    policyId: policy.id,
    severity: requiresEscalation ? 'critical' : context.signals.some((signal) => signal.level === 'warning') ? 'warning' : 'ok',
    requiresEscalation,
    rationale,
  };
};

export const defaultPolicySnapshot = (): HealthPolicy => ({ ...defaultPolicy });
