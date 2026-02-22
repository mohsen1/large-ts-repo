export interface ReadinessSimulationNode {
  readonly id: string;
  readonly owner: string;
  readonly criticality: number;
}

export interface ReadinessTimelinePoint {
  readonly minute: number;
  readonly signals: number;
  readonly weightedSeverity: number;
}

export interface ReadinessSimulationState {
  readonly tenant: string;
  readonly runId: string;
  readonly command: {
    readonly tenant: string;
    readonly runId: string;
    readonly seed: number;
    readonly targetIds: readonly string[];
  };
  readonly nodes: readonly ReadinessSimulationNode[];
  readonly projection: readonly ReadinessTimelinePoint[];
  readonly snapshots: readonly {
    runId: string;
    executedWaves: number;
    status: 'pending' | 'running' | 'complete' | 'blocked';
    completedSignals: number;
    projectedSignalCoverage: number;
  }[];
  readonly runs: readonly { runId: string; startedAt: string; status: 'unknown' | 'running' | 'complete' | 'blocked' }[];
  readonly active: boolean;
  readonly note: string;
}

export interface ReadinessSimulationControls {
  readonly canStart: boolean;
  readonly canStep: boolean;
  readonly canCancel: boolean;
}

export interface ReadinessSimulationConsoleResult {
  readonly state: ReadinessSimulationState | null;
  readonly controls: ReadinessSimulationControls;
}

export const summarizeSignals = (points: readonly ReadinessTimelinePoint[]) => {
  const totalSignals = points.reduce((memo, point) => memo + point.signals, 0);
  const weightedSum = points.reduce((memo, point) => memo + point.signals * point.weightedSeverity, 0);
  const avgSeverity = totalSignals === 0 ? 0 : weightedSum / totalSignals;
  return { totalSignals, avgSeverity };
};
