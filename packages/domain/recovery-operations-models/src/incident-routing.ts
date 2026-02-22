import { z } from 'zod';

import type { Brand } from '@shared/core';
import type {
  IncidentId,
  IncidentPlan,
  IncidentPlanId,
  IncidentRecord,
} from '@domain/recovery-incident-orchestration';
import type { RecoverySignal, RunSession, RecoveryConstraintBudget, SessionDecision } from './types';
import { routeCandidates, extractSignalIds, routeBySignalDensity, buildRouteKey } from './routing';
import type { RecoveryCommandContext } from './routing';
import type { PolicyContext, GateResult, PolicyDecision } from './policy-gates';
import { buildPolicyEnvelope, reduceGateResults } from './policy-gates';
import { withBrand } from '@shared/core';
import type { RecoveryProgram } from '@domain/recovery-orchestration';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';

export interface IncidentRoutingHint {
  readonly routeKey: Brand<string, 'RecoveryRouteKey'>;
  readonly tenant: string;
  readonly sessionId: string;
  readonly confidence: number;
}

export interface IncidentOperationPlan {
  readonly planId: IncidentPlanId;
  readonly incidentId: IncidentId;
  readonly tenant: string;
  readonly selectedRoute: string;
  readonly readinessScore: number;
  readonly decision: GateResult;
  readonly commandHints: readonly IncidentRoutingHint[];
  readonly signalIds: readonly string[];
  readonly expectedWindowMinutes: number;
  readonly priority: 'urgent' | 'normal' | 'deferred';
}

export interface IncidentOperationBundle {
  readonly incident: IncidentRecord;
  readonly plan: IncidentPlan;
  readonly session: RunSession;
  readonly budget: RecoveryConstraintBudget;
  readonly decision: GateResult;
}

const DecisionSchema = z
  .object({
    decision: z.string(),
    reasonCode: z.string(),
    score: z.number(),
    triggered: z.array(z.string()),
    acceptedAt: z.string().optional(),
  })
  .passthrough();

const RoutingBundleSchema = z.object({
  planId: z.string().min(1),
  tenant: z.string().min(1),
  signalIds: z.array(z.string()),
  readinessScore: z.number(),
  priority: z.enum(['urgent', 'normal', 'deferred']),
});

export const parseIncidentRoutingHint = (input: unknown): IncidentRoutingHint => {
  const plan = RoutingBundleSchema.parse(input);
  return {
    routeKey: buildRouteKey(plan.planId),
    tenant: plan.tenant,
    sessionId: plan.planId,
    confidence: Math.max(0, Math.min(1, plan.readinessScore)),
  };
};

const inferPriority = (score: number, routeDensity: number): 'urgent' | 'normal' | 'deferred' => {
  if (score >= 0.75 || routeDensity >= 1.2) {
    return 'urgent';
  }
  if (score >= 0.45 || routeDensity >= 0.7) {
    return 'normal';
  }
  return 'deferred';
};

export const routeKeyToText = (route: Brand<string, 'RecoveryRouteKey'>): string =>
  String(route).split(':').at(-1) ?? String(route);

const toPolicyContext = (incident: IncidentRecord, signals: readonly RecoverySignal[]): PolicyContext => {
  const avgSeverity = signals.length
    ? signals.reduce((sum, signal) => sum + signal.severity, 0) / signals.length
    : 0;
  const avgConfidence = signals.length
    ? signals.reduce((sum, signal) => sum + signal.confidence, 0) / signals.length
    : 0;
  const riskBand = avgSeverity >= 0.85 ? 'critical' : avgSeverity >= 0.65 ? 'red' : avgSeverity >= 0.4 ? 'amber' : 'green';
  return {
    tenant: incident.scope.tenantId,
    signalDensity: signals.length,
    signalConfidence: avgConfidence,
    riskBand,
    readinessWindowHours: Math.max(1, Math.round((1 - avgConfidence) * 24)),
  };
};

const buildPolicyEnvelopeSafe = (incident: IncidentRecord, signals: readonly RecoverySignal[]): GateResult[] => {
  const envelope = buildPolicyEnvelope({
    scope: 'global',
    context: toPolicyContext(incident, signals),
    fingerprint: {
      tenant: withBrand(incident.scope.tenantId, 'TenantId'),
      region: incident.scope.region,
      serviceFamily: incident.scope.serviceName,
      impactClass: 'application',
      estimatedRecoveryMinutes: 120,
    },
    signals,
  });
  return envelope;
};

const buildRoutingHints = (session: RunSession, context: RecoveryCommandContext): readonly IncidentRoutingHint[] => {
  const routes = routeCandidates(context);
  const density = routeBySignalDensity(session);
  const hints: IncidentRoutingHint[] = [];

  for (const route of routes.values()) {
    const confidence = Math.max(0, Math.min(1, 1 - Math.abs(routeBySignalDensity(session) - density) + Math.min(1, route.tags.length / 10)));
    hints.push({
      routeKey: route.key,
      tenant: context.tenant,
      sessionId: String(session.runId),
      confidence,
    });
  }
  return hints;
};

const buildCommandContext = (
  incident: IncidentRecord,
  plan: IncidentPlan,
  session: RunSession,
): RecoveryCommandContext => {
  const tenant = incident.scope.tenantId;
  const readyWindowStart = new Date();
  const readyWindowEnd = new Date(readyWindowStart.getTime() + 60 * 60 * 1000);
  const program: RecoveryProgram = {
    id: `${plan.id}:program` as RecoveryProgram['id'],
    tenant: withBrand(tenant, 'TenantId'),
    service: withBrand(incident.scope.serviceName, 'ServiceId'),
    name: `incident-${incident.id}`,
    description: incident.summary,
    priority: 'gold',
    mode: 'restorative',
    window: {
      startsAt: readyWindowStart.toISOString(),
      endsAt: readyWindowEnd.toISOString(),
      timezone: 'UTC',
    },
    topology: {
      rootServices: [incident.scope.serviceName],
      fallbackServices: [incident.scope.clusterId],
      immutableDependencies: [],
    },
    constraints: [],
    steps: [],
    owner: 'orchestrator',
    tags: ['incident'],
    createdAt: readyWindowStart.toISOString(),
    updatedAt: readyWindowEnd.toISOString(),
  };

  const readinessPlan: RecoveryReadinessPlan = {
    planId: `${incident.id}:readiness` as RecoveryReadinessPlan['planId'],
    runId: session.runId as unknown as RecoveryReadinessPlan['runId'],
    title: `readiness:${plan.id}`,
    objective: `recover:${incident.scope.serviceName}`,
    state: 'active',
    createdAt: readyWindowStart.toISOString(),
    targets: [],
    windows: [],
    signals: [],
    riskBand: 'green',
    metadata: {
      owner: incident.scope.clusterId,
      tags: ['incident'],
      tenant,
    },
  };

  const createdAt = new Date().toISOString();
  return {
    tenant,
    program,
    readinessPlan,
    createdAt,
  };
};

export const buildIncidentOperationPlan = (
  incident: IncidentRecord,
  session: RunSession,
  budget: RecoveryConstraintBudget,
  plan: IncidentPlan,
): IncidentOperationPlan => {
  const signals = session.signals;
  const policy = buildPolicyEnvelopeSafe(incident, signals);
  const decision = reduceGateResults(policy);
  const routeContext = buildCommandContext(incident, plan, session);
  const hints = buildRoutingHints(session, routeContext);
  const routeDensity = hints.reduce((acc, hint) => acc + hint.confidence, 0);
  const readinessScore = Math.max(0, Math.min(1, 1 - decision.score / 10));
  const priority = inferPriority(readinessScore, routeDensity);

  return {
    planId: plan.id,
    incidentId: incident.id,
    tenant: incident.scope.tenantId,
    selectedRoute: hints[0]?.routeKey ? routeKeyToText(hints[0].routeKey) : `route:${incident.id}`,
    readinessScore,
    decision,
    commandHints: hints,
    signalIds: extractSignalIds(signals),
    expectedWindowMinutes: budget.timeoutMinutes,
    priority,
  };
};

export const normalizeDecision = (input: unknown): GateResult => {
  const parsed = DecisionSchema.parse(input);
  const parsedDecision = parsed.decision === 'allow' || parsed.decision === 'warn' || parsed.decision === 'block'
    ? parsed.decision
    : 'warn';
  return {
    decision: parsedDecision as PolicyDecision,
    reasonCode: parsed.reasonCode,
    score: parsed.score,
    triggered: parsed.triggered,
    acceptedAt: parsed.acceptedAt,
  };
};

export const bundleFromRun = (
  incident: IncidentRecord,
  session: RunSession,
  budget: RecoveryConstraintBudget,
  plan: IncidentPlan,
  decision: SessionDecision,
): IncidentOperationBundle => ({
  incident,
  plan,
  session,
  budget,
  decision: {
    decision: decision.accepted ? 'allow' : 'warn',
    reasonCode: decision.reasonCodes.join('|'),
    score: decision.score,
    triggered: ['session-decision'],
    acceptedAt: decision.createdAt,
  },
});
