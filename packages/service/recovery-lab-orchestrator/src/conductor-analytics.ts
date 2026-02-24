import type { NoInfer } from '@shared/type-level';
import {
  buildCompositeForecast,
  type ForecastSummary,
  type ForecastTrace,
  type SurfaceSignal,
  buildForecastSummary,
  buildResultForecast,
  combineForecasts,
  forecastSignalsByLane,
  forecastSurfaceFromPlan,
} from '@domain/recovery-simulation-lab-core';
import type { LabExecution, LabLane, LabExecutionResult, LabPlanTemplate, LabScenario } from '@domain/recovery-simulation-lab-core';
import { asLabTenantId } from '@shared/recovery-lab-kernel';
import { createDisposableScope } from '@shared/recovery-lab-kernel';

export type AnalyticsLane = Exclude<LabLane, 'ingest'>;
export type AnalyticsScope<T extends string> = T extends `${infer TPrefix}:${infer _TSuffix}` ? TPrefix : T;

export interface ForecastBundle {
  readonly seed: string;
  readonly lane: AnalyticsLane;
  readonly trace: ForecastTrace;
  readonly checksum: string;
}

export interface ConductorDashboardState {
  readonly tenant: string;
  readonly summaries: readonly string[];
  readonly score: number;
  readonly topSignals: readonly [string, number][];
}

export interface ConductorMetricEvent {
  readonly traceId: string;
  readonly category: AnalyticsScope<string>;
  readonly payload: Readonly<Record<string, unknown>>;
}

const toScore = (value: number): number => Math.max(0, Math.min(1, value));

const laneMetricWeight = (lane: LabLane): number => {
  if (lane === 'simulate') {
    return 1;
  }
  if (lane === 'restore') {
    return 2;
  }
  if (lane === 'verify') {
    return 3;
  }
  return 4;
};

const seedFromTenant = async (tenant: string): Promise<string> => {
  const normalized = asLabTenantId(tenant);
  const trace = await Promise.resolve(`${normalized}:${Date.now()}`).then((value) => value);
  return `seed:${trace}`;
};

export class ConductorAnalytics {
  readonly #tenant: string;
  readonly #planCache = new Map<string, ForecastTrace>();

  public constructor(tenant: string) {
    this.#tenant = tenant;
  }

  public async forecastForExecution(execution: LabExecution): Promise<ForecastBundle> {
    const seed = await seedFromTenant(this.#tenant);
    const trace: ForecastTrace = {
      route: `${execution.executionId}::${execution.tenant}`,
      planId: `${execution.scenarioId}`,
      lane: execution.lane === 'ingest' ? 'simulate' : execution.lane,
      windows: execution.pluginIds.map((pluginId, index) => ({
        from: index,
        to: index + 1,
        mean: (index + 1) * 1.1,
        max: (index + 1) * 2.2,
        min: index * 0.5,
      })),
      metrics: {
        execution: execution.pluginIds.length,
        laneWeight: laneMetricWeight(execution.lane),
      },
    };

    return {
      seed,
      lane: trace.lane as AnalyticsLane,
      trace,
      checksum: `${seed}::${trace.planId}`,
    };
  }

  public async summarize(
    scenarios: readonly LabScenario[],
    plans: readonly LabPlanTemplate[],
  ): Promise<ConductorDashboardState> {
    await using scope = createDisposableScope();

    const summary = buildForecastSummary(this.#tenant, scenarios, plans);
    const topRoutes = summary.topSignals.slice(0, 5);

    return {
      tenant: `${asLabTenantId(this.#tenant)}`,
      summaries: [
        `scenarios:${summary.scenarios}`,
        `windows:${summary.windows.length}`,
        `top:${topRoutes.length}`,
        `scope:${scope}`,
      ],
      score: toScore(summary.topSignals.reduce((acc, [, score]) => acc + score, 0) / Math.max(1, topRoutes.length)),
      topSignals: topRoutes,
    };
  }

  public async mergeTraces(traces: readonly ForecastTrace[]): Promise<ForecastSummary> {
    return combineForecasts(...traces);
  }

  public async enrichResult(result: LabExecutionResult): Promise<ForecastTrace> {
    return buildResultForecast(result);
  }

  public async collectSignalsByLane(
    lane: AnalyticsLane,
    signals: readonly SurfaceSignal[],
  ): Promise<readonly SurfaceSignal[]> {
    return forecastSignalsByLane(lane, signals);
  }

  public cacheForecast(planId: string, trace: ForecastTrace): void {
    this.#planCache.set(planId, trace);
  }

  public getForecast(planId: string): ForecastTrace | undefined {
    return this.#planCache.get(planId);
  }

  public async buildComposite(
    lane: AnalyticsLane,
    signals: readonly SurfaceSignal[],
    plans: readonly LabPlanTemplate[],
  ): Promise<ForecastSummary> {
    const tenant = await seedFromTenant(this.#tenant);
    const laneSignals = await this.collectSignalsByLane(lane, signals);
    return buildCompositeForecast(tenant, laneSignals, plans);
  }

  public async fromPlan(
    tenant: string,
    signals: readonly SurfaceSignal[],
    plans: readonly LabPlanTemplate[],
  ): Promise<ForecastSummary> {
    const windows = await forecastSurfaceFromPlan(signals);
    const tenantWindows = windows.map((entry) => ({
      route: `${tenant}`,
      planId: tenant,
      lane: 'simulate' as LabLane,
      windows: [entry],
      metrics: {
        windows: windows.length,
      },
    }));

    const combined = await this.mergeTraces(tenantWindows);
    const map = plans.map((plan) => plan.stepIds.length).toSorted();

    return {
      ...combined,
      scenarios: map.length,
      windows: [...combined.windows, ...tenantWindows.flatMap((entry) => entry.windows)],
      topSignals: combined.topSignals
        .map(([signal, score], index) => [`${signal}::${index < map.length ? map[index] : 0}`, score]) as readonly [string, number][],
    };
  }
}

export const buildConductorAnalytics = (tenant: string): ConductorAnalytics => {
  return new ConductorAnalytics(tenant);
};

export const collectEvents = (events: readonly ConductorMetricEvent[]): ReadonlyMap<string, number> => {
  const map = new Map<string, number>();
  for (const event of events) {
    const key = `${event.category}:${event.traceId}`;
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
};

export const buildEventDigest = (events: ReadonlyMap<string, number>): readonly string[] => {
  return [...events.entries()]
    .map(([key, count]) => `${key}::${count}`)
    .toSorted();
};

export const buildSummary = <
  TSignals extends readonly SurfaceSignal[],
>(
  tenant: string,
  _signals: NoInfer<TSignals>,
  traces: readonly ForecastTrace[],
): ConductorDashboardState => {
  const merged = combineForecasts(...traces);
  const score = toScore(traces.length / Math.max(1, merged.windows.length));
  return {
    tenant: asLabTenantId(tenant),
    summaries: merged.topSignals.map(([label, score]) => `${label}:${score}`),
    score,
    topSignals: merged.topSignals,
  };
};

export const asMetricEvent = (traceId: string, scope: string, payload: Readonly<Record<string, unknown>>): ConductorMetricEvent => ({
  traceId,
  category: scope as AnalyticsScope<string>,
  payload,
});

export const mergeSummaryWindows = (
  left: ConductorDashboardState,
  right: ConductorDashboardState,
): ConductorDashboardState => {
  const merged = [...left.topSignals, ...right.topSignals]
    .toSorted((leftValue, rightValue) => rightValue[1] - leftValue[1])
    .slice(0, 10);

  return {
    tenant: left.tenant,
    summaries: [...left.summaries, ...right.summaries],
    score: toScore((left.score + right.score) / 2),
    topSignals: merged,
  };
};
