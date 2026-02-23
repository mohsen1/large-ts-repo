import { StreamTopologyPlan } from '@service/streaming-dashboard-orchestrator';
import { StreamSnapshotViewModel, streamSnapshotsToViews } from '@data/streaming-dashboard-store';

export interface DashboardRenderModel {
  streamId: string;
  health: string;
  scale: number;
  alerts: number;
  healthColor: 'green' | 'yellow' | 'red';
}

export const healthColorBySeverity = (plan: StreamTopologyPlan): 'green' | 'yellow' | 'red' => {
  const hasCriticalAlert = plan.topologyAlerts.some((alert) => alert.severity >= 4);
  if (hasCriticalAlert) return 'red';
  return plan.slaCompliant ? 'green' : 'yellow';
};

export const mapPlanToRenderModel = (plan: StreamTopologyPlan): DashboardRenderModel => ({
  streamId: plan.streamId,
  health: plan.slaCompliant ? 'healthy' : 'degraded',
  scale: plan.expectedScale,
  alerts: plan.topologyAlerts.length,
  healthColor: healthColorBySeverity(plan),
});

export const enrichSnapshots = (snapshots: ReadonlyArray<any>): StreamSnapshotViewModel[] => {
  return streamSnapshotsToViews(snapshots.map((snapshot) => ({
    id: snapshot.id,
    tenant: snapshot.tenant,
    streamId: snapshot.streamId,
    capturedAt: snapshot.capturedAt,
    lag: snapshot.lag,
    healthSignals: snapshot.healthSignals,
    throughput: snapshot.throughput,
    alerts: snapshot.alerts,
    plannedSteps: [],
    topologyId: snapshot.topologyId,
    slaWindows: snapshot.slaWindows,
  })));
};
