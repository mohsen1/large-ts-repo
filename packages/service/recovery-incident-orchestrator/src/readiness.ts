import type { IncidentRecord } from '@domain/recovery-incident-orchestration';
import {
  composeReadinessProfile,
  buildReadinessSnapshot,
  bucketByFamily,
} from '@domain/recovery-incident-orchestration';
import type { RecoveryIncidentRepository, IncidentStoreState } from '@data/recovery-incident-store';
import {
  buildIncidentRollups,
  buildAggregate,
  type IncidentRollup,
} from '@data/recovery-incident-store/queries';
import {
  buildReadinessSeries,
  buildPortfolioReadiness,
  buildResolutionVelocity,
} from '@data/recovery-incident-store/readiness-views';

export interface ReadinessWindow {
  readonly tenantId: string;
  readonly profile: ReturnType<typeof composeReadinessProfile>;
  readonly snapshots: readonly ReturnType<typeof buildReadinessSnapshot>[];
  readonly aggregateSignals: ReturnType<typeof buildAggregate>;
  readonly familyCounts: Record<string, number>;
  readonly rollups: readonly IncidentRollup[];
  readonly generatedAt: string;
}

export interface PortfolioReadiness {
  readonly windows: readonly ReadinessWindow[];
  readonly bucketSizeMinutes: number;
  readonly tenantSeries: readonly {
    readonly tenantId: string;
    readonly buckets: ReturnType<typeof buildReadinessSeries>;
    readonly velocity: ReturnType<typeof buildResolutionVelocity>;
  }[];
}

const toStoreState = async (
  repository: RecoveryIncidentRepository,
  incidents: readonly IncidentRecord[],
): Promise<IncidentStoreState> => {
  const incidentSnapshots: Array<IncidentStoreState['incidents'][number]> = [];
  const plans: Array<IncidentStoreState['plans'][number]> = [];
  const runs: Array<IncidentStoreState['runs'][number]> = [];
  const events: Array<IncidentStoreState['events'][number]> = [];

  for (const incident of incidents) {
    const planRecords = await repository.findPlans(incident.id);
    const runRecords = await repository.getRuns(incident.id);

    incidentSnapshots.push({
      id: incident.id,
      version: 1,
      label: incident.title,
      incident,
    });

    for (const plan of planRecords) {
      plans.push({
        id: plan.id,
        incidentId: plan.incidentId,
        label: plan.label,
        plan: plan.plan,
        createdAt: plan.createdAt,
      });
    }

    for (const run of runRecords) {
      runs.push({
        id: `${String(incident.id)}:${run.id}`,
        runId: run.id,
        planId: run.planId,
        itemId: run.nodeId,
        run,
        status: run.state === 'failed' ? 'failed' : run.state === 'done' ? 'done' : 'running',
      });
      events.push({
        id: `${String(incident.id)}:${run.id}:run`,
        incidentId: incident.id,
        type: 'plan_added',
        payload: {
          runId: run.id,
          nodeId: run.nodeId,
          tenantId: incident.scope.tenantId,
        },
        emittedAt: run.startedAt,
      });
    }
  }

  return {
    incidents: incidentSnapshots,
    plans,
    runs,
    events,
  };
};

export class RecoveryIncidentReadinessCoordinator {
  constructor(private readonly repository: RecoveryIncidentRepository) {}

  async runTenantReadiness(tenantId: string): Promise<ReadinessWindow> {
    const incidents = (await this.repository.findIncidents({ tenantId, limit: 5000 })).data;
    const now = new Date().toISOString();
    const profile = composeReadinessProfile(incidents, {
      incidents,
      now,
      lookbackMinutes: 60,
      minimumSignals: 1,
    });
    const snapshots = incidents.map((incident) =>
      buildReadinessSnapshot(incident, {
        incidents,
        now,
        lookbackMinutes: 60,
        minimumSignals: 1,
      }),
    );

    const familyBuckets = bucketByFamily(incidents);
    const familyCounts: Record<string, number> = {};
    for (const [family, list] of Object.entries(familyBuckets)) {
      familyCounts[family] = list.length;
    }

    const state = await toStoreState(this.repository, incidents);
    const rollups = buildIncidentRollups(
      incidents,
      state.plans,
      state.runs,
      state.events,
    );
    const aggregateSignals = buildAggregate(incidents);

    return {
      tenantId,
      profile,
      snapshots,
      aggregateSignals,
      familyCounts,
      rollups,
      generatedAt: now,
    };
  }

  async runAll(): Promise<PortfolioReadiness> {
    const allIncidents = (await this.repository.findIncidents({ limit: 8000 })).data;
    const tenantIds = [...new Set(allIncidents.map((incident) => incident.scope.tenantId))];
    const windows: ReadinessWindow[] = [];
    const tenantSeries: { tenantId: string; buckets: ReturnType<typeof buildReadinessSeries>; velocity: ReturnType<typeof buildResolutionVelocity> }[] = [];

    for (const tenantId of tenantIds) {
      const tenantIncidents = allIncidents.filter((incident) => incident.scope.tenantId === tenantId);
      const tenantState = await toStoreState(this.repository, tenantIncidents);
      const portfolioState = buildPortfolioReadiness(await toStoreState(this.repository, allIncidents));
      const tenantResult = await this.runTenantReadiness(tenantId);
      const velocity = buildResolutionVelocity(tenantState, tenantId);
      const buckets = buildReadinessSeries(tenantState, 15);
      void portfolioState;
      windows.push(tenantResult);
      tenantSeries.push({ tenantId, buckets, velocity });
    }

    return {
      windows,
      bucketSizeMinutes: 15,
      tenantSeries,
    };
  }

  async runAutoReadyCheck(tenantId: string): Promise<{ tenantId: string; action: 'noop' | 'drill'; ready: boolean; reason: string }> {
    const report = await this.runTenantReadiness(tenantId);
    const total = report.profile.summary.healthy + report.profile.summary.watch + report.profile.summary.degraded + report.profile.summary.critical;
    const ratio = total === 0 ? 0 : report.profile.summary.critical / total;
    return {
      tenantId,
      action: ratio > 0.5 ? 'drill' : 'noop',
      ready: ratio <= 0.25,
      reason: `critical=${report.profile.summary.critical}, total=${total}`,
    };
  }
}
