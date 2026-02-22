import { withBrand } from '@shared/core';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoveryOperationsEnvelope, RecoverySignal } from './types';
import type { PolicyEvaluation } from './recovery-policy-rules';

export type RouteIntent = 'observe' | 'stabilize' | 'mitigate';

export interface CandidateRoute {
  readonly tenant: string;
  readonly routeId: string;
  readonly signalId: string;
  readonly runId: string;
  readonly intent: RouteIntent;
  readonly score: number;
}

export interface RouteDraft {
  readonly tenant: string;
  readonly routeSet: readonly CandidateRoute[];
  readonly policy: PolicyEvaluation;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly generatedAt: string;
}

interface DraftBuildInput {
  readonly tenant: string;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[];
  readonly policy: PolicyEvaluation;
}

const inferIntent = (signal: RecoverySignal): RouteIntent => {
  if (signal.severity >= 8) return 'mitigate';
  if (signal.severity >= 4) return 'stabilize';
  return 'observe';
};

export const routePayloadSignals = (envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[]): readonly RecoverySignal[] => {
  return envelopes.map((envelope) => envelope.payload);
};

export const rankCandidateRoutes = (
  tenant: string,
  envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
  policy: PolicyEvaluation,
): readonly CandidateRoute[] => {
  return routePayloadSignals(envelopes)
    .map((signal, index) => {
      const intent = inferIntent(signal);
      const priorityBoost = policy.factors[0]?.score ?? 0;
      return {
        tenant,
        routeId: withBrand(`${tenant}:route:${signal.id}`, 'RecoveryRouteKey'),
        signalId: signal.id,
        runId: withBrand(`${tenant}:run:${index}`, 'RecoveryRunId'),
        intent,
        score: Number((signal.severity * (1 + priorityBoost) + signal.confidence * 10).toFixed(4)),
      };
    })
    .sort((left, right) => right.score - left.score);
};

export const draftRoutes = (input: DraftBuildInput): RouteDraft => {
  return {
    tenant: input.tenant,
    routeSet: rankCandidateRoutes(input.tenant, input.envelopes, input.policy),
    policy: input.policy,
    readinessPlan: input.readinessPlan,
    generatedAt: new Date().toISOString(),
  };
};

export const routeCoverageByIntent = (routeSet: readonly CandidateRoute[]): Record<RouteIntent, number> => {
  const totals = { observe: 0, stabilize: 0, mitigate: 0 } as Record<RouteIntent, number>;

  for (const route of routeSet) {
    totals[route.intent] += 1;
  }

  return totals;
};
