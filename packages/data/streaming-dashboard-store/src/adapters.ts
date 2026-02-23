import { computeSignalDensity, summarizeLevels } from '@domain/streaming-observability';
import { DashboardStreamSnapshot, StreamTopologyStats } from './models';
import { PlanStep } from '@domain/streaming-engine';

export interface StreamSnapshotViewModel {
  streamId: string;
  capturedAt: string;
  healthScore: number;
  alertsCount: number;
  topologyHealthLabel: string;
  throughputPerSecond: number;
  signalDensity: number;
  topology: StreamTopologyStats;
}

type Plan = { steps?: PlanStep[] };

export const streamSnapshotToView = (snapshot: DashboardStreamSnapshot): StreamSnapshotViewModel => {
  const signalDensity = computeSignalDensity(snapshot.healthSignals);
  const levelDistribution = summarizeLevels(snapshot.healthSignals);
  const criticalCount = levelDistribution.critical;
  const warnings = levelDistribution.warning;
  const healthLabel = criticalCount > 0 ? 'critical' : warnings > 0 ? 'warning' : 'healthy';
  return {
    streamId: snapshot.streamId,
    capturedAt: snapshot.capturedAt,
    healthScore: Number((100 - signalDensity * 100).toFixed(2)),
    alertsCount: snapshot.alerts.length,
    topologyHealthLabel: healthLabel,
    throughputPerSecond: snapshot.throughput.eventsPerSecond,
    signalDensity,
    topology: {
      streamId: snapshot.streamId,
      nodeCount: 1,
      edgeCount: 0,
    },
  };
};

export const streamSnapshotsToViews = (snapshots: readonly DashboardStreamSnapshot[]): StreamSnapshotViewModel[] =>
  snapshots.map(streamSnapshotToView);

export const enrichWithPlan = (snapshot: DashboardStreamSnapshot, plan: Plan): DashboardStreamSnapshot => {
  return {
    ...snapshot,
    plannedSteps: plan?.steps ? [...plan.steps] : [],
    topologyId: snapshot.topologyId,
  };
};
