import type {
  ForecastWindow,
  IncidentForecast,
  IncidentReadiness,
  IncidentSignal,
  RecoveryPlay,
  SignalBundle,
  SignalSeverity,
} from './types';
import { aggregateSignals, topContributingSignals } from './pipeline';

const playCatalog: RecoveryPlay[] = [
  {
    playId: 'play:reroute-traffic' as RecoveryPlay['playId'],
    name: 'Reroute traffic and throttle ingress',
    urgency: 'elevated',
    expectedRecoveryMinutes: 6,
    blastRadius: 'medium',
    candidates: [
      {
        actionId: 'action:traffic-shape',
        label: 'Enable ingress shaping',
        weight: 0.73,
        rationale: 'Reduce load on impacted control surfaces',
        prerequisites: ['prereq:network-safety'],
      },
      {
        actionId: 'action:edge-drain',
        label: 'Drain unhealthy regions',
        weight: 0.58,
        rationale: 'Move sessions away from unstable nodes',
        prerequisites: ['prereq:region-aware-route'],
      },
    ],
  },
  {
    playId: 'play:rollback-config' as RecoveryPlay['playId'],
    name: 'Rollback risky configuration change',
    urgency: 'urgent',
    expectedRecoveryMinutes: 18,
    blastRadius: 'high',
    candidates: [
      {
        actionId: 'action:rollback',
        label: 'Rollback most recent commit',
        weight: 0.9,
        rationale: 'Mitigate unbounded blast from bad deployment',
        prerequisites: ['prereq:rollback-window', 'prereq:change-auth'],
      },
    ],
  },
  {
    playId: 'play:credential-safeguard' as RecoveryPlay['playId'],
    name: 'Harden authentication path',
    urgency: 'urgent',
    expectedRecoveryMinutes: 11,
    blastRadius: 'low',
    candidates: [
      {
        actionId: 'action:rotate-secrets',
        label: 'Rotate exposed secrets',
        weight: 0.67,
        rationale: 'Reduce lateral movement risk',
        prerequisites: ['prereq:kms-ready'],
      },
    ],
  },
];

const urgencyPriority: Record<SignalSeverity, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const forecastFromSignals = (
  signals: readonly IncidentSignal[],
): { score: number; volatility: number; concentration: number; dependencyRisk: number } => {
  const aggregation = aggregateSignals(signals);
  const ordered = signals
    .slice()
    .sort(
      (left, right) =>
        urgencyPriority[right.severity] - urgencyPriority[left.severity] ||
        right.confidence - left.confidence,
    );

  const top = ordered.slice(0, Math.max(1, Math.floor(ordered.length * 0.2)));
  const topShare = top.length / Math.max(signals.length, 1);
  const concentration = Number(Math.min(topShare, 1).toFixed(3));
  const dependencyRisk = Number(
    Math.min(
      1,
      aggregation.byDimension.reduce((acc, item) => acc + item.weightedComponents.length, 0) / Math.max(signals.length, 1),
    ),
  );

  const volatility = Number((aggregation.overall * 0.8 + concentration * 0.2).toFixed(3));
  const score = Number(
    Math.min(1, 0.55 * (signals.length ? aggregation.overall : 0) + 0.45 * concentration),
  );

  return { score, volatility, concentration, dependencyRisk: Number(dependencyRisk.toFixed(3)) };
}

export const deriveReadiness = (bundle: SignalBundle): IncidentReadiness => {
  const aggregation = aggregateSignals(bundle.signals);
  const score = Number((1 - aggregation.overall).toFixed(3));
  const top = topContributingSignals(bundle.signals).map((signal) => signal.signalId);
  const state: IncidentReadiness['state'] =
    aggregation.overall >= 0.8 ? 'critical' : aggregation.overall >= 0.6 ? 'degraded' : aggregation.overall >= 0.35 ? 'unstable' : 'healthy';

  return {
    tenantId: bundle.tenantId,
    incidentId: bundle.incidentId,
    state,
    score,
    confidence: bundle.vectors.length ? Math.max(...bundle.vectors.map((item) => item.normalizedScore)) : 0,
    observedUntil: bundle.window.endAt,
    contributingSignals: top,
  };
};

const recommend = (signals: readonly IncidentSignal[]): readonly RecoveryPlay[] => {
  const scoreByDimension = aggregateSignals(signals);
  const hasSecurityCritical = signals.some((signal) => signal.dimension === 'security' && signal.severity === 'critical');
  const hasInfraDegradation = signals.some((signal) => signal.dimension === 'infrastructure' && signal.severity === 'critical');
  const hasControlInstability = signals.some((signal) => signal.dimension === 'control-plane');

  const selected = new Map<string, RecoveryPlay>();

  for (const play of scoreByDimension.byDimension.length ? playCatalog : []) {
    selected.set(play.playId, play);
  }

  if (hasSecurityCritical) selected.set(playCatalog[2].playId, playCatalog[2]);
  if (hasInfraDegradation) selected.set(playCatalog[1].playId, playCatalog[1]);
  if (hasControlInstability) selected.set(playCatalog[0].playId, playCatalog[0]);

  return Array.from(selected.values()).slice(0, 3);
};

export const generateForecast = (
  bundle: SignalBundle,
  windowMinutes: number,
  planId: string,
): IncidentForecast => {
  const risk = forecastFromSignals(bundle.signals);
  const forecastWindow: ForecastWindow = {
    startAt: new Date().toISOString(),
    endAt: new Date(Date.now() + windowMinutes * 60_000).toISOString(),
    recoveryMinutesEstimate: Math.round((1 + risk.volatility * 30 + risk.concentration * 60) * 1.5),
    confidence: Number((1 - risk.score).toFixed(3)),
    planId: planId as IncidentForecast['forecastWindow']['planId'],
  };

  return {
    forecastId: `forecast:${bundle.bundleId}` as IncidentForecast['forecastId'],
    tenantId: bundle.tenantId,
    bundleId: bundle.bundleId,
    forecastWindow,
    readiness: deriveReadiness(bundle),
    recommendations: recommend(bundle.signals),
    riskProfile: {
      volatility: risk.volatility,
      concentration: risk.concentration,
      dependencyRisk: risk.dependencyRisk,
    },
    createdAt: new Date().toISOString(),
  };
};
