import { collectDecisions, type PolicyDecision } from './policy';
import { buildDependencyGraph, buildRoutes, summarizeGraph } from './graph';
import {
  type FailureSignal,
  type FailureActionPlan,
  type FailurePlanAction,
  type IncidentFingerprint,
  type PlanRisk,
} from './models';

const MAX_ACTIONS = 6;

const toAction = (decision: PolicyDecision, index: number): FailurePlanAction => ({
  id: `${decision.ruleId}-${index}` as any,
  action: decision.actions[index % decision.actions.length]?.name ?? 'ignore',
  reason: decision.reason,
  confidence: Math.round(decision.confidence * 100) / 100,
  runbook: `runbook://${decision.ruleId}`,
  args: {
    decision: decision.ruleId,
    confidence: decision.confidence,
    order: index,
  },
});

const fingerprint = (signals: readonly FailureSignal[], decisions: readonly PolicyDecision[]): IncidentFingerprint => {
  const dominant = signals[0]?.component ?? 'unknown';
  const highestSeverity = Math.max(...signals.map((signal) => severityIndex(signal.severity)));
  const maxConfidence = Math.max(...decisions.map((decision) => decision.confidence), 0);

  return {
    tenantId: signals[0]?.tenantId ?? ('' as any),
    component: dominant,
    rootCause: decisions.map((decision) => decision.ruleId).join(',') || 'none',
    score: Math.min(1, (signals.length / 10) + maxConfidence * 0.6),
    severity: highestSeverity >= 3 ? (maxConfidence >= 0.75 ? 'critical' : 'high') : (maxConfidence >= 0.55 ? 'moderate' : 'low'),
  };
};

const severityIndex = (value: FailureSignal['severity']): number =>
  value === 'p0' ? 4 : value === 'p1' ? 3 : value === 'p2' ? 2 : 1;

export const buildPlan = (signals: readonly FailureSignal[]): FailureActionPlan | undefined => {
  if (signals.length === 0) return undefined;

  const decisions = collectDecisions(signals);
  if (decisions.length === 0) return undefined;

  const signalIds = signals.map((signal) => signal.id);
  const graph = buildDependencyGraph(signalIds);
  const routes = buildRoutes(graph);

  const orderedActions = decisions.flatMap((decision, index) =>
    decision.actions.slice(0, 2).map((_action, offset) => toAction(decision, index + offset + 1)),
  );

  const selectedActions = orderedActions.slice(0, MAX_ACTIONS);
  return {
    id: `plan-${Date.now()}` as any,
    tenantId: signals[0].tenantId,
    signalIds,
    fingerprint: {
      ...fingerprint(signals, decisions),
    },
    actions: selectedActions,
    owner: routes.length > 0 ? `owner:${String(routes[0]?.target)}` : undefined,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
};

export const summarizePlan = (plan: FailureActionPlan): string => {
  const graphSummary = summarizeGraph(buildDependencyGraph(plan.signalIds));
  return [
    `plan=${plan.id}`,
    `tenant=${String(plan.tenantId)}`,
    `risk=${plan.fingerprint.severity}`,
    `graph=${graphSummary}`,
    `actions=${plan.actions.length}`,
  ].join(' ');
};
