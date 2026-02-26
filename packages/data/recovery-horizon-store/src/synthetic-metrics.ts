import type { Result } from '@shared/result';
import { err, ok } from '@shared/result';
import {
  createRepository,
  type RecoveryHorizonRepository,
  writeSignals,
} from './repository.js';
import {
  type HorizonLookupConfig,
  type HorizonMutationEvent,
  type HorizonReadResult,
  type HorizonStoreRecord,
  type HorizonSignalEnvelope,
  type HorizonPlanEnvelope,
} from './types.js';
import {
  type HorizonSignal,
  type JsonLike,
  type PluginStage,
  type PlanId,
  type RunId,
  type TimeMs,
  horizonBrand,
} from '@domain/recovery-horizon-engine';

export type { HorizonStoreRecord } from './types.js';

export interface HorizonWindowSnapshot {
  readonly tenantId: string;
  readonly events: readonly HorizonMutationEvent[];
  readonly total: number;
  readonly windows: WindowIndex;
}

type StageWindow = {
  readonly stage: PluginStage;
  readonly count: number;
  readonly minAt: TimeMs;
  readonly maxAt: TimeMs;
};

type WindowIndex = Record<PluginStage, StageWindow>;

export interface StageTimeline {
  readonly tenantId: string;
  readonly values: readonly {
    readonly stage: PluginStage;
    readonly at: TimeMs;
    readonly score: number;
  }[];
}

export interface ForecastInput {
  readonly tenantId: string;
  readonly targetRunId: RunId;
  readonly horizonMs: TimeMs;
  readonly includeWarnings?: boolean;
}

export interface ForecastOutput {
  readonly tenantId: string;
  readonly planId: PlanId;
  readonly confidence: number;
  readonly projections: readonly {
    readonly stage: PluginStage;
    readonly at: TimeMs;
    readonly count: number;
  }[];
}

export interface SyntheticMetricEngine {
  collect(tenantId: string, config?: Partial<HorizonLookupConfig>): Promise<Result<HorizonStoreRecord[]>>;
  snapshot(tenantId: string): Promise<Result<HorizonWindowSnapshot>>;
  forecast(input: ForecastInput): Promise<Result<ForecastOutput>>;
  seed(signals: readonly HorizonSignalEnvelope[], tenantId: string): Promise<Result<number>>;
  seedPlan(planEnvelope: HorizonPlanEnvelope, tenantId: string): Promise<Result<true>>;
}

export type HorizonForecastEngine = SyntheticMetricEngine;

const STAGE_ORDER = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const satisfies readonly PluginStage[];
const nowMs = (): TimeMs => Date.now() as TimeMs;
const toJsonLike = (value: unknown): JsonLike => value as JsonLike;

const makeWindowRecord = (): WindowIndex => ({
  ingest: { stage: 'ingest', count: 0, minAt: 0 as TimeMs, maxAt: 0 as TimeMs },
  analyze: { stage: 'analyze', count: 0, minAt: 0 as TimeMs, maxAt: 0 as TimeMs },
  resolve: { stage: 'resolve', count: 0, minAt: 0 as TimeMs, maxAt: 0 as TimeMs },
  optimize: { stage: 'optimize', count: 0, minAt: 0 as TimeMs, maxAt: 0 as TimeMs },
  execute: { stage: 'execute', count: 0, minAt: 0 as TimeMs, maxAt: 0 as TimeMs },
});

const toWindowIndex = (events: readonly HorizonMutationEvent[]): WindowIndex => {
  const windows = makeWindowRecord();
  let cursor = 0;

  for (const event of events) {
    const stage = STAGE_ORDER[cursor % STAGE_ORDER.length];
    cursor += 1;

    const current = windows[stage];
    windows[stage] = {
      ...current,
      count: current.count + 1,
      minAt: current.count === 0 ? event.at : (event.at < current.minAt ? event.at : current.minAt),
      maxAt: current.count === 0 ? event.at : (event.at > current.maxAt ? event.at : current.maxAt),
    };
  }

  return windows;
};

const collectEvents = (result: HorizonReadResult): HorizonMutationEvent[] =>
  result.items.map((record, index) => ({
    kind: 'upsert',
    tenantId: record.tenantId,
    planId: record.id,
    runId: record.runId,
    at: (record.updatedAt + index) as TimeMs,
  }));

export const collectWindow = (result: HorizonReadResult): HorizonWindowSnapshot => {
  const events = collectEvents(result);
  return {
    tenantId: result.items[0]?.tenantId ?? 'tenant-001',
    events,
    total: events.length,
    windows: toWindowIndex(events),
  };
};

export const mapToTimeline = (
  records: readonly HorizonSignal<PluginStage, JsonLike>[],
): StageTimeline => ({
  tenantId: records[0]?.input.tenantId ?? 'tenant-001',
  values: records
    .map((record, index) => ({
      stage: record.input.stage,
      at: (index * 17) as TimeMs,
      score: record.input.runId.length + record.input.tags.length + index,
    }))
    .toSorted((left, right) => left.at - right.at),
});

const withUpdatedWindow = <T extends readonly HorizonSignal<PluginStage, JsonLike>[]>(
  records: T,
): readonly StageWindow[] => {
  const windows = makeWindowRecord();
  return records.map((_, index) => {
    const stage = STAGE_ORDER[index % STAGE_ORDER.length];
    const next = windows[stage];
    windows[stage] = {
      ...next,
      count: next.count + 1,
      minAt: next.count === 0 ? nowMs() : (nowMs() < next.minAt ? nowMs() : next.minAt),
      maxAt: next.count === 0 ? nowMs() : (nowMs() > next.maxAt ? nowMs() : next.maxAt),
    };
    return windows[stage];
  });
};

export const projectCounts = <T extends readonly HorizonSignal<PluginStage, JsonLike>[]>(
  signals: T,
): readonly {
  readonly stage: PluginStage;
  readonly count: number;
}[] => {
  const totals: Record<PluginStage, number> = {
    ingest: 0,
    analyze: 0,
    resolve: 0,
    optimize: 0,
    execute: 0,
  };
  for (const signal of signals) {
    totals[signal.input.stage] += 1;
  }

  return STAGE_ORDER.map((stage) => ({
    stage,
    count: totals[stage],
  }));
};

export const withScore = <TSignals extends readonly HorizonSignal<PluginStage, JsonLike>[]>(
  signals: TSignals,
): readonly {
  readonly signal: TSignals[number];
  readonly score: number;
}[] => {
  return signals
    .map((signal, index) => ({
      signal,
      score: Number(signal.input.runId.length + index) * 1.5,
    }))
    .toSorted((left, right) => right.score - left.score);
};

export class HorizonSynthesisStoreEngine implements SyntheticMetricEngine {
  readonly #repository: RecoveryHorizonRepository;
  readonly #seed: number;

  constructor(repository?: RecoveryHorizonRepository) {
    this.#repository = repository ?? createRepository('tenant-001');
    this.#seed = Date.now();
  }

  async collect(
    tenantId: string,
    config: Partial<HorizonLookupConfig> = {},
  ): Promise<Result<HorizonStoreRecord[]>> {
    const response = await this.#repository.read({
      tenantId,
      stages: STAGE_ORDER,
      ...config,
    });
    if (!response.ok) {
      return response;
    }
    return ok([...response.value.items]);
  }

  async snapshot(tenantId: string): Promise<Result<HorizonWindowSnapshot>> {
    const response = await this.#repository.read({
      tenantId,
      stages: STAGE_ORDER,
      maxRows: 1024,
    });
    if (!response.ok) {
      return response;
    }
    return ok(collectWindow(response.value));
  }

  async forecast(input: ForecastInput): Promise<Result<ForecastOutput>> {
    const base = await this.snapshot(input.tenantId);
    if (!base.ok) {
      return err(base.error);
    }

    const projectedSignals = base.value.events.map((event, index) => {
      const stage = STAGE_ORDER[index % STAGE_ORDER.length];
      const at = (event.at + index) as TimeMs;
      return {
        id: horizonBrand.fromPlanId(`signal:${event.runId}:${input.targetRunId}:${index}`),
        kind: stage,
        payload: toJsonLike({
          planId: event.planId,
          windowMs: input.horizonMs,
          eventKind: event.kind,
        }),
        input: {
          version: '1.0.0',
          runId: input.targetRunId,
          tenantId: event.tenantId,
          stage,
          tags: ['forecast', input.tenantId, event.kind],
          metadata: {
            tenant: event.tenantId,
            runId: event.runId,
            sourceKind: event.kind,
            stage,
          },
        },
        severity: 'low',
        startedAt: horizonBrand.fromDate(new Date(Number(at)).toISOString()),
      } satisfies HorizonSignal<PluginStage, JsonLike>;
    });

    const timeline = mapToTimeline(projectedSignals);
    const projectedByStage = withUpdatedWindow(projectedSignals).map((window, index) => {
      const stage = STAGE_ORDER[index % STAGE_ORDER.length];
      return {
        stage,
        at: (window.maxAt + Number(input.horizonMs)) as TimeMs,
        count: Math.max(1, window.count),
      };
    });

    const confidence = Math.min(1, Math.max(0.1, timeline.values.length ? 1 / Math.log2(timeline.values.length + 2) : 0.2));

    return ok({
      tenantId: input.tenantId,
      planId: horizonBrand.fromPlanId(`forecast:${input.tenantId}:${input.targetRunId}`),
      confidence,
      projections: projectedByStage.slice(0, STAGE_ORDER.length),
    });
  }

  async seed(signals: readonly HorizonSignalEnvelope[], tenantId: string): Promise<Result<number>> {
    const prepared = signals.map((entry) => ({
      ...entry.payload,
      input: {
        ...entry.payload.input,
        tenantId: entry.context.tenantId,
      },
    }));
    const written = await writeSignals(this.#repository, tenantId, prepared);
    if (!written.ok) {
      return err(written.error);
    }
    return ok(written.value);
  }

  async seedPlan(planEnvelope: HorizonPlanEnvelope, tenantId: string): Promise<Result<true>> {
    const metadataTime = nowMs();
      const planSignal = {
        id: horizonBrand.fromPlanId(`plan:${this.#seed}:${planEnvelope.plan.id}`),
        kind: 'execute' as const,
        payload: toJsonLike({
          plan: planEnvelope.plan,
          config: planEnvelope.config,
        }),
      input: {
        version: '1.0.0',
        runId: horizonBrand.fromRunId(`plan:${this.#seed}:${Number(metadataTime)}`),
        tenantId,
        stage: 'execute' as const,
        tags: ['seed', 'plan'],
        metadata: {
          origin: 'seedPlan',
          tenantId,
        },
      },
      severity: 'low',
      startedAt: horizonBrand.fromDate(new Date(Number(metadataTime)).toISOString()),
    } satisfies HorizonSignal<'execute', JsonLike>;

    const seeded = await writeSignals(this.#repository, tenantId, [planSignal]);
    return seeded.ok ? ok(true) : err(seeded.error);
  }
}

export const createSyntheticMetricEngine = (repository?: RecoveryHorizonRepository): SyntheticMetricEngine =>
  new HorizonSynthesisStoreEngine(repository);
