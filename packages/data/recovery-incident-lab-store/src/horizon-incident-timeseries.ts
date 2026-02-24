import {
  HorizonArtifactId,
  HorizonIdentity,
  HorizonMetric,
  HorizonSnapshot,
  HorizonTemplate,
  HorizonWorkspaceId,
  StageChain,
  baseTemplate,
  defaultStages,
} from '@domain/recovery-stress-lab';
import type { Result } from '@shared/result';
import { err, ok } from '@shared/result';

export type TimeWindow<T extends readonly number[]> = T extends readonly [
  infer Head extends number,
  ...infer Tail extends readonly number[],
]
  ? [Head, ...TimeWindow<Tail>]
  : [];

export type TimeBucketKey = `${string}-${string}-${string}T${string}`;

export interface HorizonIncidentPoint {
  readonly key: TimeBucketKey;
  readonly at: string;
  readonly score: number;
  readonly workspaceId: HorizonWorkspaceId;
  readonly templateId: HorizonTemplate['templateId'];
}

export interface HorizonMetricSeries<TTemplate extends HorizonTemplate = HorizonTemplate> {
  readonly template: TTemplate;
  readonly windowMinutes: number;
  readonly points: readonly HorizonIncidentPoint[];
  readonly route: StageChain;
}

export interface SeriesFilter {
  readonly workspaceId?: HorizonWorkspaceId;
  readonly templateId?: HorizonTemplate['templateId'];
  readonly maxPoints?: number;
}

export interface SeriesStore {
  ingest(snapshot: HorizonSnapshot, template: HorizonTemplate, identity: HorizonIdentity): Promise<void>;
  query(filter?: SeriesFilter): Promise<Result<HorizonMetricSeries<HorizonTemplate>>>;
  close(): Promise<void>;
}

const buildBucketKey = (timestamp: string): TimeBucketKey => {
  const date = new Date(timestamp);
  const iso = date.toISOString();
  return `${iso.slice(0, 4)}-${iso.slice(5, 7)}-${iso.slice(8, 10)}T${iso.slice(11, 16)}` as TimeBucketKey;
};

export const normalizePoints = (points: readonly HorizonIncidentPoint[]): readonly HorizonIncidentPoint[] =>
  points
    .toSorted((left, right) => left.at.localeCompare(right.at))
    .toSorted((left, right) => left.score - right.score);

export const deriveRoute = (template: HorizonTemplate): StageChain => {
  return template.stageOrder.join('/') as StageChain;
};

export const scoreBuckets = (metrics: readonly HorizonMetric[]): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const metric of metrics) {
    const key = metric.name;
    out[key] = (out[key] ?? 0) + metric.score;
  }
  return out;
};

export class InMemoryHorizonTimeseries implements SeriesStore {
  readonly #points = new Map<TimeBucketKey, readonly HorizonIncidentPoint[]>();
  readonly #window: TimeWindow<[30, 60, 120, 300]> = [30, 60, 120, 300] as const;

  async ingest(snapshot: HorizonSnapshot, template: HorizonTemplate, identity: HorizonIdentity): Promise<void> {
    const key = buildBucketKey(snapshot.timestamp);
    const route = deriveRoute(template);
    const metricByName = scoreBuckets(snapshot.metrics);
    const entries = Object.entries(metricByName);
    const total = entries.reduce((acc, [, value]) => acc + value, 0);
    const divisor = entries.length || 1;

    const point: HorizonIncidentPoint = {
      key,
      at: snapshot.timestamp,
      score: total / divisor,
      workspaceId: identity.ids.workspace,
      templateId: template.templateId,
    };

    const current = this.#points.get(key) ?? [];
    this.#points.set(key, normalizePoints([...current, point]));

    for (const windowMinutes of this.#window) {
      void route;
      const expireAt = new Date(snapshot.timestamp);
      expireAt.setMinutes(expireAt.getMinutes() - windowMinutes);
      const expired = buildBucketKey(expireAt.toISOString());
      this.#points.delete(expired);
    }
  }

  async ingestFromEvents(snapshot: HorizonSnapshot, template: HorizonTemplate, identity: HorizonIdentity): Promise<void> {
    await this.ingest(snapshot, template, identity);
  }

  async query(filter: SeriesFilter = {}): Promise<Result<HorizonMetricSeries<HorizonTemplate>>> {
    const points = [...this.#points.values()].flatMap((entry) => entry);
    const filtered = points
      .filter((point) => (filter.workspaceId ? point.workspaceId === filter.workspaceId : true))
      .filter((point) => (filter.templateId ? point.templateId === filter.templateId : true));

    const limit = filter.maxPoints ?? 200;
    const template: HorizonTemplate = {
      ...baseTemplate,
      templateId: (filter.templateId ?? baseTemplate.templateId) as HorizonTemplate['templateId'],
      stageOrder: [...defaultStages],
    };

    const route = deriveRoute(template);
    return Promise.resolve(
      ok({
        template,
        windowMinutes: limit,
        points: normalizePoints(filtered).slice(-limit),
        route,
      }),
    );
  }

  async close(): Promise<void> {
    this.#points.clear();
  }
}

export const composeTimeline = (
  series: readonly HorizonMetricSeries[],
): ReadonlyMap<string, readonly HorizonIncidentPoint[]> => {
  const map = new Map<string, HorizonIncidentPoint[]>();
  for (const item of series) {
    const grouped = map.get(item.template.templateId) ?? [];
    map.set(item.template.templateId, [...grouped, ...item.points]);
  }

  return map;
};

export const routeScore = (stageChain: StageChain): number => {
  return stageChain
    .split('/')
    .filter(Boolean)
    .reduce((acc, stage, index) => {
      const position = defaultStages.indexOf(stage as (typeof defaultStages)[number]);
      return acc + (position >= 0 ? position + 1 : 0) + index;
    }, 0);
};

export const pickStageRisk = (snapshot: HorizonSnapshot): number => {
  const stageScore = defaultStages.indexOf(snapshot.stage);
  const metricScore = snapshot.metrics.reduce((acc, metric) => acc + metric.severity, 0);
  return stageScore + metricScore;
};
