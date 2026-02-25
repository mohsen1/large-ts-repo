import {
  diagnosticsByStatus,
  defaultDiagnostics,
  collectHealthTrend,
  evaluateArtifact,
  type DiagnosticResult,
} from '@shared/chronicle-orchestration-protocol';
import type { ChronicleStatus } from '@shared/chronicle-orchestration-protocol';
import {
  buildSessionStatus,
  type InsightRecord,
  type MetricPath,
  type SimulationOutput,
  type MetricQuery,
  type SessionAxis,
  type PlannerResult,
  type BlueprintPhase,
} from './models';

export interface InsightWorkspace {
  readonly route: string;
  readonly tenant: string;
  readonly records: readonly InsightRecord[];
}

export interface ScoreBand {
  readonly bucket: 'critical' | 'warning' | 'healthy';
  readonly score: number;
  readonly count: number;
}

export interface InsightEvent {
  readonly key: string;
  readonly payload: Readonly<Record<string, number>>;
}

const toBucket = (score: number): ScoreBand['bucket'] =>
  score < 35 ? 'critical' : score < 70 ? 'warning' : 'healthy';

export const buildInsightBuckets = (records: readonly InsightRecord[]): readonly ScoreBand[] => {
  const totals = new Map<string, { sum: number; count: number }>();
  for (const record of records) {
    for (const value of record.values) {
      const key = toBucket(value.score);
      const prev = totals.get(key) ?? { sum: 0, count: 0 };
      totals.set(key, {
        sum: prev.sum + value.score,
        count: prev.count + 1,
      });
    }
  }

  return [...totals.entries()].map(([bucket, value]) => ({
    bucket: bucket as ScoreBand['bucket'],
    count: value.count,
    score: Math.round(value.sum / value.count),
  }));
};

export const deriveInsights = (results: readonly SimulationOutput[]): readonly InsightRecord[] =>
  results.map((result): InsightRecord => {
    const session = buildSessionStatus(result);
    const values = Object.entries(result.metrics).map(([axis, score]) => ({
      axis: axis as SessionAxis,
      score: Number(score),
      trend: score > 60 ? ('up' as const) : score > 30 ? ('flat' as const) : ('down' as const),
    }));

    return {
      route: session.route,
      tenant: session.tenant,
      values,
    };
  });

export const summarizeInsights = (records: readonly InsightRecord[]): string =>
  buildInsightBuckets(records).map((band) => `${band.bucket}:${band.score}%(${band.count})`).join(' | ');

export const queryInsights = (records: readonly InsightRecord[], query: MetricQuery): readonly InsightRecord[] =>
  records.filter(
    (record) => record.route === query.route && record.values.some((value) => value.axis.startsWith(query.path)),
  );

export const scoreTrend = (records: readonly InsightRecord[]): readonly ('up' | 'down' | 'flat')[] => {
  const bands = buildInsightBuckets(records);
  return bands.map((band) => (band.bucket === 'healthy' ? 'up' : band.bucket === 'warning' ? 'flat' : 'down'));
};

export const buildWorkspace = (tenant: string, route: string, records: readonly InsightRecord[]): InsightWorkspace => ({
  route,
  tenant,
  records,
});

export const enrichDiagnostics = async (records: readonly InsightRecord[]): Promise<{
  readonly diagnostics: readonly DiagnosticResult[];
  readonly workspace: InsightWorkspace;
}> => {
  const diagMap = diagnosticsByStatus(defaultDiagnostics);
  const diagnostics = [...diagMap.succeeded, ...diagMap.degraded, ...diagMap.failed];
  return {
    diagnostics,
    workspace: {
      tenant: 'tenant:default',
      route: 'chronicle://default',
      records,
    },
  };
};

export const collectTrendSignal = async (results: readonly SimulationOutput[]): Promise<number> => {
  const diagnostics = await collectHealthTrend(
    await Promise.all(
      results.map(async (result) => ({
        createdAt: Date.now(),
        route: result.graph.route,
        entries: [
          {
            route: result.graph.route,
            runId: result.runId,
            status: evaluateArtifact({
              createdAt: Date.now(),
              route: result.graph.route,
              entries: [],
            }),
            message: `${result.status}: ${result.events.length}`,
            confidence: result.metrics['metric:score'] / 100,
            severity: 'info',
            tags: ['collect'],
          },
        ],
      })),
    ),
  );
  return diagnostics.at(-1) ?? 0;
};

export const statusToBand = (status: ChronicleStatus): string => ({
  idle: 'blue',
  queued: 'blue',
  running: 'yellow',
  succeeded: 'green',
  degraded: 'yellow',
  failed: 'red',
}[status]);

export const transformPlannerResult = <T extends readonly BlueprintPhase[]>(planner: PlannerResult<T>): number[] =>
  planner.orderedPhases.map((phase, index) => `${phase}`.length + index);

export const enrichEvents = (events: readonly InsightEvent[]): InsightEvent[] =>
  events.toReversed().map((event) => ({
    key: event.key,
    payload: event.payload,
  }));

export const scorePath = <T>(path: MetricPath<T>): string => `path:${path}`;
