import { RecoverySimulationResult, TenantId, OrchestrationPlan } from '@domain/recovery-stress-lab';
import { compareSimulationsForDrift, summarizeSimulation } from '@domain/recovery-stress-lab';
import { ok, fail, Result } from '@shared/result';

export interface TelemetryEvent {
  readonly tenantId: TenantId;
  readonly eventType: 'plan-built' | 'plan-refreshed' | 'simulation-complete' | 'drift-detected';
  readonly metadata: {
    readonly occurredAt: string;
    readonly payload: Record<string, unknown>;
  };
}

export interface TelemetrySummary {
  readonly tenantId: TenantId;
  readonly totalEvents: number;
  readonly latestEvent: string;
  readonly driftSignals: readonly string[];
}

const EVENT_LIMIT = 48;

export class StressLabTelemetryBus {
  private readonly events: Map<TenantId, TelemetryEvent[]> = new Map();

  recordEvent(event: TelemetryEvent): void {
    const list = this.events.get(event.tenantId) ?? [];
    const bounded = [event, ...list].slice(0, EVENT_LIMIT);
    this.events.set(event.tenantId, bounded);
  }

  summary(tenantId: TenantId): TelemetrySummary {
    const list = this.events.get(tenantId) ?? [];
    return {
      tenantId,
      totalEvents: list.length,
      latestEvent: list[0]?.eventType ?? 'none',
      driftSignals: list.filter((entry) => entry.eventType === 'drift-detected').map((entry) => entry.metadata.payload['plan'] as string).filter((value): value is string => typeof value === 'string'),
    };
  }

  eventTypes(tenantId: TenantId): ReadonlyArray<TelemetryEvent['eventType']> {
    return (this.events.get(tenantId) ?? []).map((entry) => entry.eventType);
  }
}

export interface DriftCheckInput {
  readonly tenantId: TenantId;
  readonly previous: RecoverySimulationResult | null;
  readonly candidate: RecoverySimulationResult;
}

export const detectSimulationDrift = (input: DriftCheckInput): string[] => {
  if (!input.previous) {
    return [];
  }
  const diff = compareSimulationsForDrift(input.previous, input.candidate);
  return diff.changed ? [diff.reason] : [];
};

export const summarizeTelemetryHistory = (entries: readonly TelemetryEvent[]): {
  readonly counts: Record<TelemetryEvent['eventType'], number>;
  readonly firstAt: string;
  readonly lastAt: string;
} => {
  const counts: Record<TelemetryEvent['eventType'], number> = {
    'plan-built': 0,
    'plan-refreshed': 0,
    'simulation-complete': 0,
    'drift-detected': 0,
  };

  for (const entry of entries) {
    counts[entry.eventType] = (counts[entry.eventType] ?? 0) + 1;
  }

  return {
    counts,
    firstAt: entries[entries.length - 1]?.metadata.occurredAt ?? '',
    lastAt: entries[0]?.metadata.occurredAt ?? '',
  };
};

export interface PlanAudit {
  readonly tenantId: TenantId;
  readonly score: number;
  readonly hasRisk: boolean;
  readonly maxLag: number;
}

export const auditPlan = (plan: OrchestrationPlan | null, simulation: RecoverySimulationResult | null): PlanAudit => {
  const score = plan?.estimatedCompletionMinutes ?? 0;
  const summary = simulation ? summarizeSimulation('tenant' as TenantId, 'low', simulation) : null;
  const maxLag = (summary?.tickCount ?? 0) / 10;
  return {
    tenantId: plan?.tenantId ?? ('tenant' as TenantId),
    score,
    hasRisk: (summary?.avgConfidence ?? 0) < 0.7,
    maxLag,
  };
};

export const asResult = (
  tenantId: TenantId,
  summary: TelemetrySummary,
): Result<TelemetrySummary, Error> => {
  if (summary.totalEvents < 0) {
    return fail(new Error(`Invalid event count for ${tenantId}`));
  }
  return ok(summary);
};
