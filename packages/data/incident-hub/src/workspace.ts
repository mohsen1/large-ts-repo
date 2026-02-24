import { summarize } from './queries';
import { collectMetrics, NoopIncidentMetricsSink } from './telemetry';
import { InMemoryEventHub, type EventPayload, type TypedEvent } from './stream';
import type { IncidentRepository } from './store';
import type { IncidentRecord, IncidentSeverity, TenantId } from '@domain/incident-management';
import { buildPortfolio, type PortfolioSnapshot, summarizePortfolio } from '@domain/incident-management';
import { buildHealthCard, computeReadinessSignals } from './analytics';
import type { HealthCard, ReadinessSignal } from './analytics';
import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';

export type IncidentWorkspaceId = ReturnType<typeof withBrand>;
export type WorkspaceSnapshotId = ReturnType<typeof withBrand>;

export interface WorkspaceFilters {
  tenantId?: TenantId;
  severities?: readonly IncidentSeverity[];
  includeResolved?: boolean;
  limit?: number;
}

export interface WorkspaceSnapshot {
  readonly id: WorkspaceSnapshotId;
  readonly tenantId: TenantId;
  readonly at: string;
  readonly incidents: readonly IncidentRecord[];
  readonly health: HealthCard;
  readonly signals: readonly ReadinessSignal[];
  readonly summaries: readonly ReturnType<typeof summarize>[];
}

export interface IncidentWorkspaceStore {
  saveSnapshot(snapshot: WorkspaceSnapshot): Promise<Result<void>>;
  listSnapshots(tenantId: TenantId, limit?: number): Promise<Result<readonly WorkspaceSnapshot[]>>;
}

const makeWorkspaceId = (tenantId: TenantId): IncidentWorkspaceId =>
  withBrand(`workspace:${tenantId}:${Date.now()}`, 'IncidentWorkspaceId');

export class InMemoryWorkspaceStore implements IncidentWorkspaceStore {
  private readonly state = new Map<string, WorkspaceSnapshot[]>();

  async saveSnapshot(snapshot: WorkspaceSnapshot): Promise<Result<void>> {
    try {
      const existing = this.state.get(snapshot.tenantId) ?? [];
      existing.unshift(snapshot);
      this.state.set(snapshot.tenantId, existing.slice(0, 25));
      return ok(undefined);
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('workspace-save-failed'));
    }
  }

  async listSnapshots(tenantId: TenantId, limit = 5): Promise<Result<readonly WorkspaceSnapshot[]>> {
    try {
      return ok((this.state.get(tenantId) ?? []).slice(0, limit));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('workspace-list-failed'));
    }
  }
}

export interface WorkspaceCommand {
  readonly workspaceId: IncidentWorkspaceId;
  readonly tenantId: TenantId;
  readonly command: 'refresh' | 'snapshot' | 'purge';
  readonly performedBy: string;
}

export interface WorkspaceRuntime {
  refresh(tenantId: TenantId): Promise<Result<WorkspaceSnapshot>>;
  emit(event: WorkspaceCommand): Promise<Result<void>>;
  recent(tenantId: TenantId, limit?: number): Promise<Result<readonly WorkspaceSnapshot[]>>;
  query(tenantId: TenantId, filters?: WorkspaceFilters): Promise<Result<readonly WorkspaceSnapshot[]>>;
}

const applyFilters = (
  incidents: readonly IncidentRecord[],
  filters?: WorkspaceFilters,
): readonly IncidentRecord[] => {
  if (!filters) return incidents;
  return incidents.filter((incident) => {
    if (!filters.includeResolved && (incident.state === 'resolved' || incident.state === 'false-positive')) return false;
    if (filters.severities?.length && !filters.severities.includes(incident.triage.severity)) return false;
    return true;
  });
};

const portfolioToSignal = (portfolio: PortfolioSnapshot): ReadinessSignal[] => {
  const risk = portfolio.avgSeverity ? portfolio.avgSeverity : 0;
  return [
    {
      id: `${portfolio.tenantId}:portfolio-${Date.now()}`,
      tenantId: portfolio.tenantId,
      at: new Date().toISOString(),
      score: risk,
      signal: risk >= 3 ? 'blocker' : 'throughput',
      details: `${portfolio.activeCount} active incidents, ${portfolio.critical} critical`,
    },
  ];
};

export class IncidentWorkspaceRuntime implements WorkspaceRuntime {
  private readonly hub = new InMemoryEventHub('workspace');

  constructor(
    private readonly repository: IncidentRepository,
    private readonly store: IncidentWorkspaceStore,
  ) {}

  async refresh(tenantId: TenantId): Promise<Result<WorkspaceSnapshot>> {
    const list = await this.repository.list({ tenantId, limit: 200 });
    if (!list.ok) return fail(list.error, list.code);

    const incidents = applyFilters(list.value, { tenantId, includeResolved: false });
    const portfolio = buildPortfolio(incidents);
    const health = buildHealthCard(tenantId, incidents);
    const signals = [...computeReadinessSignals(tenantId, incidents), ...portfolioToSignal(portfolio)];
    const snapshot: WorkspaceSnapshot = {
      id: makeWorkspaceId(tenantId),
      tenantId,
      at: new Date().toISOString(),
      incidents,
      health,
      signals,
      summaries: incidents.map(summarize),
    };
    await this.store.saveSnapshot(snapshot);
    return ok(snapshot);
  }

  async emit(event: WorkspaceCommand): Promise<Result<void>> {
    const payload: EventPayload = {
      tenantId: event.tenantId,
      topic: 'incident.workspace.command',
      payload: {
        command: event.command,
        workspaceId: event.workspaceId,
        by: event.performedBy,
      },
      timestamp: new Date().toISOString(),
      source: 'incident-workspace-runtime',
    };

    const typed: TypedEvent = {
      id: event.workspaceId,
      type: 'workspace-command',
      event: payload,
    };

    this.hub.emit(payload);
    this.hub.subscribe({
      id: `${event.workspaceId}:ack`,
      onEvent: () => Promise.resolve(),
    });
    return ok(undefined);
  }

  async recent(tenantId: TenantId, limit = 6): Promise<Result<readonly WorkspaceSnapshot[]>> {
    return this.store.listSnapshots(tenantId, limit);
  }

  async query(tenantId: TenantId, filters?: WorkspaceFilters): Promise<Result<readonly WorkspaceSnapshot[]>> {
    const snapshots = await this.store.listSnapshots(tenantId, 20);
    if (!snapshots.ok) return fail(snapshots.error, snapshots.code);

    if (!filters) return ok([...snapshots.value]);
    const filtered = snapshots.value.filter((snapshot) => {
      if (filters.tenantId && snapshot.tenantId !== filters.tenantId) return false;
      return snapshot.signals.length > 0 || snapshot.incidents.length > 0;
    });

    return ok(filtered);
  }
}

export const summarizeSnapshotPortfolio = (snapshot: WorkspaceSnapshot): {
  readonly portfolio: ReturnType<typeof summarizePortfolio>;
  readonly metric: ReturnType<typeof collectMetrics>;
} => {
  const sink = new NoopIncidentMetricsSink();
  const portfolio = buildPortfolio(snapshot.incidents, { tenantId: snapshot.tenantId, includeResolved: true });
  void sink.emit(collectMetrics(snapshot.incidents));
  return {
    portfolio: summarizePortfolio(portfolio),
    metric: collectMetrics(snapshot.incidents),
  };
};
