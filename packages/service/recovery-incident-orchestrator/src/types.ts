export interface ServiceConfig {
  readonly repositoryId: string;
  readonly correlationPrefix: string;
  readonly enableAutoPrune: boolean;
}

export interface ServiceDependencies {
  readonly repositoryId: string;
  readonly correlationPrefix: string;
}

export interface ServiceAuditEntry {
  readonly eventId: string;
  readonly incidentId: string;
  readonly action: string;
  readonly success: boolean;
  readonly details: string;
  readonly occurredAt: string;
}

export interface ServiceMetrics {
  readonly planCount: number;
  readonly runCount: number;
  readonly approvedCount: number;
  readonly failedCount: number;
}

export interface ServiceSnapshot {
  readonly repositoryId: string;
  readonly lastResult?: unknown;
  readonly auditTrail: readonly ServiceAuditEntry[];
  readonly metrics: ServiceMetrics;
}

export const mkServiceAudit = (incidentId: string, action: string): ServiceAuditEntry => ({
  eventId: `${incidentId}:${action}:${Date.now()}`,
  incidentId,
  action,
  success: true,
  details: `auto-${action}`,
  occurredAt: new Date().toISOString(),
});

export const mkServiceMetrics = (seed: number): ServiceMetrics => ({
  planCount: seed,
  runCount: seed * 2,
  approvedCount: Math.floor(seed / 2),
  failedCount: Math.floor(seed / 4),
});

export const mkServiceSnapshot = (dependencies: ServiceDependencies, incidentId: string): ServiceSnapshot => ({
  repositoryId: dependencies.repositoryId,
  auditTrail: [mkServiceAudit(incidentId, 'build')],
  metrics: mkServiceMetrics(incidentId.length),
});
