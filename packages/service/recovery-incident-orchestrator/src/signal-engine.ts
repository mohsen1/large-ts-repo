import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import {
  type SignalEnvelope,
  type SignalRiskProfile,
  type SignalPlanCandidate,
  type SignalWindow,
  type SignalQueryFilter,
  type SignalId,
  buildForecast,
  normalizeSignalRisk,
  proposeSignalPlan,
  makeTenantId,
  makeSignalId,
  type TenantId,
  type SignalScoreModel,
  buildWindowStats,
} from '@domain/incident-signal-intelligence';
import { buildSignalAggregate, buildEdgesFromSignals } from '@data/incident-signal-store';
import { summarizeSignalGraph, buildDependencyGraph, projectSpread } from '@domain/incident-signal-intelligence';
import type { SignalRepository } from '@data/incident-signal-store';

export interface SignalPlanRequest {
  readonly tenantId: TenantId;
  readonly signalId: SignalId;
  readonly reason: string;
}

export interface SignalOrchestrationResult {
  readonly contextTenant: TenantId;
  readonly processedSignals: readonly SignalEnvelope[];
  readonly riskProfiles: readonly SignalRiskProfile[];
  readonly plans: readonly SignalPlanCandidate[];
  readonly forecastPoints: number;
  readonly graphSummary: ReturnType<typeof summarizeSignalGraph>;
}

const DEFAULT_SIGNAL_MODEL: SignalScoreModel = {
  bias: 0.25,
  multipliers: {
    operational: 0.2,
    financial: 0.14,
    security: 0.22,
    capacity: 0.24,
    availability: 0.2,
  },
  recencyWeight: 0.8,
  dampening: 1.0,
};

const evaluateSignalRisk = async (
  signal: SignalEnvelope,
  window: SignalWindow,
): Promise<SignalRiskProfile> => {
  const [first] = window.samples;
  const score = first
    ? Math.min(1, (signal.vector.magnitude + first.magnitude + signal.vector.entropy) / 3)
    : signal.vector.magnitude;
  const stats = buildWindowStats(window);
  const dampened = Math.min(1, (signal.vector.variance + score + stats.volatility) / (stats.count + 1));

  return {
    signalId: signal.id,
    riskBand: normalizeSignalRisk(dampened),
    confidence: Number((Math.min(0.99, 0.35 + signal.vector.magnitude * 0.65)).toFixed(3)),
    impactScore: Number((dampened + DEFAULT_SIGNAL_MODEL.bias).toFixed(4)),
    mitigationLeadMinutes: Math.max(10, Math.round(dampened * 180)),
  };
};

export const buildSignalOrchestrator = (
  tenantId: TenantId,
  signalStore: SignalRepository,
  repo: RecoveryIncidentRepository,
): {
  execute: (filter?: SignalQueryFilter) => Promise<SignalOrchestrationResult>;
  proposePlan: (request: SignalPlanRequest) => Promise<SignalPlanCandidate>;
  summarizeByIncident: (tenantId: TenantId) => Promise<number>;
} => {
  const execute = async (
    filter: SignalQueryFilter = { tenantId } as SignalQueryFilter,
  ): Promise<SignalOrchestrationResult> => {
    const effectiveTenant: TenantId = filter.tenantId ?? tenantId;
    const signals = await signalStore.query({ filter: { ...filter, tenantId: effectiveTenant } });
    const profileMap = new Map<SignalId, SignalRiskProfile>();
    const plans: SignalPlanCandidate[] = [];

    const edges = [
      ...buildEdgesFromSignals(signals),
      {
        from: makeSignalId(`probe-${effectiveTenant}`),
        to: makeSignalId(effectiveTenant),
        weight: 0.2,
      },
    ];

    for (const signal of signals) {
      const window: SignalWindow = {
        from: new Date(Date.now() - 30 * 60_000).toISOString(),
        to: new Date().toISOString(),
        samples: [signal.vector],
      };
      const profile = await evaluateSignalRisk(signal, window);
      profileMap.set(signal.id, profile);

      if (profile.riskBand === 'high' || profile.riskBand === 'critical') {
        const plan = proposeSignalPlan(signal.id, signal.tenantId, `Stabilize ${signal.meta.source}`, profile.impactScore, [
          {
            type: 'notify',
            priority: 8,
            target: signal.meta.region,
          },
          {
            type: 'scale',
            priority: 7,
            target: signal.meta.observedBy,
          },
        ]);
        plans.push(plan);
        await signalStore.appendPlan(plan);
      }
    }

    const forecasts = buildForecast(effectiveTenant, signals, DEFAULT_SIGNAL_MODEL);
    void repo.findIncidents({ tenantId: effectiveTenant, limit: 10 });
    const graph = buildDependencyGraph(signals, edges);
    const projections = signals
      .slice(0, 5)
      .map((signal) => projectSpread(signals, edges, signal.id));
    const aggregate = buildSignalAggregate(signals, plans);
    void aggregate;

    return {
      contextTenant: effectiveTenant,
      processedSignals: signals,
      riskProfiles: [...profileMap.values()],
      plans,
      forecastPoints: forecasts.points.length,
      graphSummary: summarizeSignalGraph(projections),
    };
  };

  const proposePlan = async (request: SignalPlanRequest): Promise<SignalPlanCandidate> => {
    const signal = await signalStore.findById(request.signalId);
    if (!signal) {
      throw new Error(`signal not found: ${request.signalId}`);
    }
    const plan = proposeSignalPlan(
      signal.id,
      request.tenantId,
      request.reason,
      signal.vector.magnitude,
      [
        {
          type: 'notify',
          priority: 9,
          target: signal.meta.source,
        },
      ],
    );
    await signalStore.appendPlan(plan);
    return plan;
  };

  const summarizeByIncident = async (incidentTenant: TenantId): Promise<number> => {
    const incidents = await repo.findIncidents({ tenantId: incidentTenant, limit: 100 });
    const activeSignals = await signalStore.query({
      filter: {
        tenantId: incidentTenant,
        states: ['observed', 'confirmed', 'degraded'],
      },
    });
    return incidents.total + activeSignals.length;
  };

  return {
    execute,
    proposePlan,
    summarizeByIncident,
  };
};
