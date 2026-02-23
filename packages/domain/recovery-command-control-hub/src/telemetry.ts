import { type HubExecution } from './types';

export interface HubSnapshot {
  readonly runId: string;
  readonly recordedAt: string;
  readonly checkpointCount: number;
  readonly failedCheckpoints: number;
  readonly activeNodeCount: number;
  readonly blockedCount: number;
}

export interface HubFlowMetric {
  readonly key: string;
  readonly attempts: number;
  readonly failures: number;
}

export const snapshotExecution = (execution: HubExecution): HubSnapshot => {
  const failed = execution.checkpoints.filter((checkpoint) => checkpoint.state === 'failed').length;
  const active = execution.run.topology.nodes.filter((node) => node.state === 'executing').length;

  return {
    runId: execution.run.runId,
    recordedAt: new Date().toISOString(),
    checkpointCount: execution.checkpoints.length,
    failedCheckpoints: failed,
    activeNodeCount: active,
    blockedCount: execution.blocked.length,
  };
};

export const nodeFlow = (execution: HubExecution): readonly HubFlowMetric[] => {
  const metrics = new Map<string, { attempts: number; failures: number }>();
  for (const checkpoint of execution.checkpoints) {
    const previous = metrics.get(checkpoint.nodeId) ?? { attempts: 0, failures: 0 };
    metrics.set(checkpoint.nodeId, {
      attempts: previous.attempts + 1,
      failures: checkpoint.state === 'failed' ? previous.failures + 1 : previous.failures,
    });
  }

  return [...metrics.entries()].map(([key, item]) => ({
    key,
    attempts: item.attempts,
    failures: item.failures,
  }));
};
