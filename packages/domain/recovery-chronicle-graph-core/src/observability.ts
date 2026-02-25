import {
  asChronicleGraphTenantId,
  asChronicleGraphRunId,
  type ChronicleGraphObservation,
  type ChronicleGraphPhase,
  type ChronicleGraphRunId,
  type ChronicleGraphRoute,
} from './identity.js';
import { type NoInfer } from '@shared/type-level';

export type Trend = 'up' | 'flat' | 'down';

export interface GraphMetricRecord {
  readonly runId: ChronicleGraphRunId;
  readonly phase: ChronicleGraphPhase;
  readonly route: ChronicleGraphRoute;
  readonly score: number;
  readonly latencyMs: number;
  readonly at: number;
}

export type MetricByPhase<TPhases extends readonly ChronicleGraphPhase[]> = {
  readonly [K in TPhases[number] as `metric:${K}`]: number;
};

export interface GraphMetricSummary<TPhases extends readonly ChronicleGraphPhase[]> {
  readonly runId: ChronicleGraphRunId;
  readonly route: ChronicleGraphRoute;
  readonly metrics: MetricByPhase<TPhases>;
  readonly trend: readonly Trend[];
  readonly phaseCount: number;
}

const trendBetween = (left: number, right: number): Trend => {
  if (right > left) return 'up';
  if (right === left) return 'flat';
  return 'down';
};

export class ChronicleGraphMetrics<TPhases extends readonly ChronicleGraphPhase[]> {
  readonly #records: GraphMetricRecord[] = [];

  public add<TPayload>(observation: ChronicleGraphObservation<TPayload>, score: number): void {
    this.#records.push({
      runId: observation.id,
      phase: observation.phase,
      route: observation.route,
      score,
      latencyMs: Math.max(1, Date.now() - observation.timestamp),
      at: Date.now(),
    });
  }

  public byPhase(phase: ChronicleGraphPhase<TPhases[number] & string>): readonly GraphMetricRecord[] {
    return this.#records.filter((record) => record.phase === phase);
  }

  public trend(): readonly Trend[] {
    if (this.#records.length === 0) return ['flat'];
    const ordered = this.#records.toSorted((left, right) => left.at - right.at);
    return ordered.toSorted((left, right) => left.at - right.at).map((record, index, values) => {
      if (index === 0) return 'flat';
      return trendBetween(values[index - 1].score, record.score);
    });
  }

  public summarize(route: ChronicleGraphRoute, phases: NoInfer<TPhases>): GraphMetricSummary<TPhases> {
    const records = this.#records.filter((record) => record.route === route);
    const buckets = {} as Record<string, number>;

    for (const phase of phases) {
      const perPhase = records.filter((entry) => entry.phase === phase);
      const top = perPhase.reduce((acc, entry) => (entry.score > acc ? entry.score : acc), 0);
      buckets[`metric:${phase}`] = top;
    }

    const latest = records.at(-1);
    const runId = latest
      ? latest.runId
      : asChronicleGraphRunId(
          asChronicleGraphTenantId(asChronicleGraphRouteFromMetric(route).replace('chronicle-graph://summary/', 'tenant:')),
          route,
        );

    return {
      runId,
      route,
      metrics: buckets as MetricByPhase<TPhases>,
      trend: this.trend(),
      phaseCount: phases.length,
    };
  }
}

const asChronicleGraphRouteFromMetric = (value: string): string => `chronicle-graph://summary/${value}`;

export interface MetricReport<TPhases extends readonly ChronicleGraphPhase[]> {
  readonly route: ChronicleGraphRoute;
  readonly summary: GraphMetricSummary<TPhases>;
  readonly values: readonly number[];
}

export const buildMetricReport = <TPhases extends readonly ChronicleGraphPhase[]>
(
  route: ChronicleGraphRoute,
  phases: TPhases,
  observations: readonly ChronicleGraphObservation<unknown>[],
): MetricReport<TPhases> => {
  const metrics = new ChronicleGraphMetrics<TPhases>();
  for (const [index, observation] of observations.entries()) {
    const payload = observation.payload;
    const score =
      typeof payload === 'object' && payload !== null && 'score' in payload
        ? Number((payload as { score?: number }).score ?? index)
        : index;
    metrics.add(observation, score);
  }

  return {
    route,
    summary: metrics.summarize(route, phases),
    values: observations.map((observation, index) => (observation.timestamp % 100) + index),
  };
};

export const summarizeTimeline = <TPhases extends readonly ChronicleGraphPhase[]>(
  route: ChronicleGraphRoute,
  phases: NoInfer<TPhases>,
  observations: readonly ChronicleGraphObservation<unknown>[],
): MetricReport<TPhases> => buildMetricReport(route, phases, observations);

export const aggregateScore = (values: readonly number[]): number =>
  values.length === 0 ? 0 : values.reduce((acc, value) => acc + value, 0) / values.length;
