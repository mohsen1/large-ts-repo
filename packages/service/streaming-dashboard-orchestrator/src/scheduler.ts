import { StreamTopologyPlan } from './orchestrator';
import { InMemoryStreamingDashboardRepository, queryDashboardSnapshots } from '@data/streaming-dashboard-store';

export interface SimulationTask {
  tenant: string;
  streamId: string;
  delayMs: number;
}

export const buildSchedule = (tenant: string, streamIds: readonly string[]): SimulationTask[] =>
  streamIds.map((streamId, index) => ({
    tenant,
    streamId,
    delayMs: Math.max(30, (index + 1) * 120),
  }));

export const runSchedule = async (
  tasks: readonly SimulationTask[],
): Promise<StreamTopologyPlan[]> => {
  const out = [] as StreamTopologyPlan[];
  for (const task of tasks) {
    await delay(task.delayMs);
    out.push({
      streamId: task.streamId,
      topologyAlerts: [],
      planSteps: [],
      expectedScale: 1,
      slaCompliant: true,
      snapshotId: `${task.tenant}:${task.streamId}:${Date.now()}`,
    });
  }
  return out;
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface TenantDashboardCursor {
  tenant: string;
  cursor: string;
}

export const nextCursor = async (
  repository: InMemoryStreamingDashboardRepository,
  tenant: string,
): Promise<TenantDashboardCursor> => {
  const result = await queryDashboardSnapshots(repository, { tenant });
  const next = String(result.snapshots.length);
  return { tenant, cursor: next };
};
