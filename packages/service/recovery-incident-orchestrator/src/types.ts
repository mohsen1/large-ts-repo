import type { OrchestrateResult } from './runtime';
import type { IncidentCommandResult } from '@data/recovery-incident-store';
import type { IncidentPlan, IncidentRecord } from '@domain/recovery-incident-orchestration';

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
  readonly lastResult?: OrchestrateResult;
  readonly lastImportResult?: IncidentCommandResult;
  readonly auditTrail: readonly ServiceAuditEntry[];
  readonly metrics: ServiceMetrics;
}

export interface ServiceDependencies {
  readonly repositoryId: string;
  readonly correlationPrefix: string;
}

export const toServiceAudit = (result: OrchestrateResult, repositoryId: string): ServiceAuditEntry => ({
  eventId: `${repositoryId}:${result.plan.id}:run:${result.runs.length}`,
  incidentId: result.plan.incidentId,
  action: 'execute',
  success: true,
  details: `runs=${result.runs.length}, approved=${result.approved}`,
  occurredAt: new Date().toISOString(),
});

export const buildServiceMetrics = (plan: IncidentPlan, incidents: readonly IncidentRecord[]): ServiceMetrics => {
  const incidentCount = incidents.length;
  const planCount = plan.route.nodes.length;
  const runCount = incidents.reduce((total, current) => {
    return total + Math.max(0, current.snapshots.length);
  }, 0);
  const approvedCount = plan.approved ? 1 : 0;
  const failedCount = plan.riskScore > 0.9 ? 1 : 0;

  return {
    planCount,
    runCount,
    approvedCount,
    failedCount,
  };
}

export const buildServiceSnapshot = (
  repositoryId: string,
  result: OrchestrateResult | undefined,
  incidents: readonly IncidentRecord[],
  history: readonly ServiceAuditEntry[],
): ServiceSnapshot => ({
  repositoryId,
  lastResult: result,
  auditTrail: history,
  metrics: {
    planCount: incidents.length,
    runCount: incidents.reduce((acc) => acc + 1, 0),
    approvedCount: incidents.filter((incident) => !!incident.resolvedAt).length,
    failedCount: incidents.filter((incident) => incident.severity === 'extreme').length,
  },
});
