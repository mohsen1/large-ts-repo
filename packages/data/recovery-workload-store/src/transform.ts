import type {
  WorkloadSnapshot,
  ScenarioForecast,
  WorkloadDependencyGraph,
  WorkloadUnitId,
  StoredRecord,
} from './types';
import type { ForecastInput } from '@domain/recovery-workload-intelligence';
import type { WorkloadViewRow, WorkloadTrendPoint } from './types';
import { buildTrendSeries as toTrendSeries } from './repository';

interface ForecastWindow {
  readonly snapshot: WorkloadSnapshot;
  readonly score: number;
}

export interface EnrichedRecord {
  readonly record: StoredRecord;
  readonly normalizedRisk: number;
  readonly trendStrength: number;
  readonly dependencyLoad: number;
}

export interface TransformReport {
  readonly hotNodes: readonly WorkloadUnitId[];
  readonly avgTrend: number;
}

const normalizedSignal = (snapshot: WorkloadSnapshot): number =>
  (snapshot.cpuUtilization + snapshot.iopsUtilization + snapshot.errorRate) / 300;

const forecastPenalty = (forecasts: readonly ScenarioForecast[]): number =>
  forecasts.reduce((acc, forecast) => acc + forecast.projectedDowntimeMinutes, 0) / Math.max(1, forecasts.length);

export const normalizeRecords = (records: readonly StoredRecord[]): readonly EnrichedRecord[] =>
  records.map((record) => {
    const weighted = record.snapshots.reduce((acc, snapshot) => acc + normalizedSignal(snapshot), 0);
    const snapshotsLength = record.snapshots.length === 0 ? 1 : record.snapshots.length;
    return {
      record,
      normalizedRisk: weighted / snapshotsLength,
      trendStrength: forecastPenalty(record.forecastHistory),
      dependencyLoad: Math.max(1, record.forecastHistory.length),
    };
  });

export const toRowsByQuery = (
  records: readonly StoredRecord[],
): readonly WorkloadViewRow[] =>
  records.map((record) => {
    const latest = record.snapshots.at(-1);
    return {
      nodeId: record.nodeId,
      nodeName: record.node.name,
      snapshotAt: latest?.timestamp ?? record.updatedAt,
      riskSignal: latest ? normalizedSignal(latest) : 0,
      activeForecastCount: record.forecastHistory.length,
    };
  });

export const computeTrendSeries = (
  records: readonly StoredRecord[],
  graph: WorkloadDependencyGraph,
): readonly WorkloadTrendPoint[] => toTrendSeries(records, graph);

export const collectForecastInputs = (records: readonly StoredRecord[]): readonly ForecastInput[] =>
  records.flatMap((record) =>
    record.snapshots.map((snapshot) => ({
      node: record.node,
      snapshot,
      riskVector: {
        severity: snapshot.cpuUtilization > 85 ? 5 : 3,
        blastRadius: record.node.criticality >= 4 ? 'global' : record.node.criticality >= 3 ? 'region' : 'zone',
        customerImpact: record.node.targetSlaMinutes,
        recoveryToleranceSeconds: record.node.targetSlaMinutes * 60,
      },
      lookbackDays: Math.max(7, snapshot.timestamp.length % 21),
    })),
  );

export const projectToGraphNodes = (inputs: readonly ForecastInput[]): WorkloadDependencyGraph => {
  const nodes = [...new Set(inputs.map((entry) => entry.node.id))].map((nodeId) =>
    inputs.find((entry) => entry.node.id === nodeId)?.node,
  );
  const safeNodes = nodes.filter((node): node is NonNullable<typeof node> => Boolean(node));
  const windows: ForecastWindow[] = safeNodes.map((node) => ({
    snapshot: inputs.find((entry) => entry.node.id === node.id)?.snapshot ?? {
      nodeId: node.id,
      timestamp: new Date().toISOString(),
      cpuUtilization: 35,
      iopsUtilization: 20,
      errorRate: 3,
      throughput: 2200,
    },
    score: safeNodes.length,
  }));

  const edges = windows.flatMap((entry, index) =>
    index + 1 < windows.length
      ? [
        {
          parent: windows[index]!.snapshot.nodeId,
          child: windows[index + 1]!.snapshot.nodeId,
          relationship: safeNodes[index]?.criticality != null && safeNodes[index].criticality >= 4
            ? ('hard' as const)
            : ('soft' as const),
          latencyMs: 40 + ((index + 1) * 7),
        },
      ]
      : [],
  );
  return { nodes: safeNodes, edges };
;
};

export const summarizeRecords = (records: readonly StoredRecord[]): TransformReport => {
  const enriched = normalizeRecords(records);
  const avgTrend = enriched.reduce((acc, entry) => acc + entry.trendStrength, 0) / Math.max(1, enriched.length);
  const hotNodes = enriched.filter((entry) => entry.normalizedRisk > 0.75).map((entry) => entry.record.nodeId);
  return {
    hotNodes,
    avgTrend,
  };
};
