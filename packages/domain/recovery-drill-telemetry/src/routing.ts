import type { RecoveryDrillEvent, RecoveryDrillMetricSample, RecoverySignalSeverity } from './types';

export interface RoutePolicy {
  readonly target: 's3' | 'sns' | 'console';
  readonly minimumSeverity: RecoverySignalSeverity;
  readonly includeMetrics: boolean;
}

export interface RoutedEvent {
  readonly route: RoutePolicy;
  readonly event: RecoveryDrillEvent;
  readonly sample?: RecoveryDrillMetricSample;
  readonly reason: string;
}

const severityOrder: RecoverySignalSeverity[] = ['info', 'warn', 'degrade', 'error', 'critical'];

const shouldRoute = (actual: RecoverySignalSeverity, minimum: RecoverySignalSeverity): boolean =>
  severityOrder.indexOf(actual) >= severityOrder.indexOf(minimum);

export const routeEvent = (event: RecoveryDrillEvent, policies: readonly RoutePolicy[]): RoutedEvent[] => {
  const includes = policies
    .filter((policy) => shouldRoute(event.severity, policy.minimumSeverity))
    .map((policy) => ({ route: policy, event, reason: `severity:${event.severity}` }));

  return includes.length > 0
    ? includes
    : [{
        route: {
          target: 'console',
          minimumSeverity: 'info',
          includeMetrics: false,
        },
        event,
        reason: 'default-route',
      }];
}

export const routeAnomaly = (
  sample: RecoveryDrillMetricSample,
  policies: readonly RoutePolicy[],
): RoutedEvent => {
  const event: RecoveryDrillEvent = {
    kind: 'anomaly',
    at: sample.observedAt,
    runId: sample.eventId as any,
    tenant: sample.correlationId as any,
    scenarioId: sample.eventId as any,
    severity: sample.metric.current > sample.metric.maxSafe ? 'critical' : 'error',
    title: 'metric_anomaly',
    payload: {
      eventId: sample.eventId,
      metric: sample.metric,
    },
  };

  const matched = policies.filter((policy) => shouldRoute(event.severity, policy.minimumSeverity));

  return {
    route: matched[0] ?? {
      target: 'console',
      minimumSeverity: 'info',
      includeMetrics: true,
    },
    event,
    sample,
    reason: 'metric-threshold',
  };
};
