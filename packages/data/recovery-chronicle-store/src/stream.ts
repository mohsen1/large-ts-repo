import { fail, ok, type Result } from '@shared/result';
import { asChroniclePhase, asChronicleTag, makeRunId, type ChronicleObservation, type ChroniclePhase, type ChroniclePlanId, type ChronicleRunId, type ChronicleRoute, type ChronicleScenario, type ChronicleTenantId } from '@domain/recovery-chronicle-core';
import { ChronicleInMemoryAdapter, ChronicleRepository } from './store.js';
import { seededScenario } from './entities.js';

export interface ChronicleStreamConfig {
  readonly tenantPrefix?: string;
  readonly phase?: ChroniclePhase<string>;
  readonly maxItems?: number;
}

export interface ChronicleTimelineEvent {
  readonly runId: ChronicleRunId;
  readonly sequence: number;
  readonly payload: ChronicleObservation;
}

const iteratorFrom = (values: Iterable<ChronicleTimelineEvent>): ChronicleTimelineEvent[] => {
  const support = (globalThis as { Iterator?: { from?: <T>(value: Iterable<T>) => { toArray: () => T[] } } }).Iterator?.from;
  if (!support) {
    return [...values];
  }
  return support(values).toArray();
};

const withSort = <T>(items: readonly T[], compare: (left: T, right: T) => number): T[] =>
  [...items].sort(compare);

export class ChronicleStreamEngine {
  readonly #adapter: ChronicleInMemoryAdapter;

  public constructor(adapter: ChronicleInMemoryAdapter = new ChronicleInMemoryAdapter(new ChronicleRepository())) {
    this.#adapter = adapter;
  }

  public async runMockTimeline(limit = 20): Promise<ReadonlyArray<ChronicleTimelineEvent>> {
    const events: ChronicleTimelineEvent[] = [];
    const runId = makeRunId(seededScenario.id);
    for (let sequence = 0; sequence < limit; sequence += 1) {
      const payload: ChronicleObservation = {
        id: `event:${runId}:${sequence}` as ChronicleObservation['id'],
        kind: `event:${asChroniclePhase('mock')}` as ChronicleObservation['kind'],
        tenant: seededScenario.tenant,
        runId,
        timestamp: Date.now() + sequence,
        source: asChronicleTag(`mock-${sequence}`),
        phase: sequence % 2 === 0 ? 'phase:bootstrap' : 'phase:verification',
        route: seededScenario.route,
        value: {
          progress: sequence / Math.max(limit, 1),
          health: 100 - sequence,
        },
      };

      events.push({ runId, sequence, payload });
    }

    await this.#adapter.writeScenarioRun(
      seededScenario,
      events.map((event) => event.payload),
    );

    return events;
  }

  public async streamTenantRuns(
    tenant: ChronicleTenantId,
    config: ChronicleStreamConfig = {},
  ): Promise<Result<ReadonlyArray<ChronicleTimelineEvent>>> {
    const targetPhase = config.phase ?? 'phase:bootstrap';
    const maxItems = config.maxItems ?? 10;
    const rows = await this.#adapter.repository.listByTenant(tenant);
    const filtered = rows.filter((row) => row.payload.phase === targetPhase);
    const mapped = filtered
      .map((row, index) => ({
        runId: row.runId,
        sequence: index,
        payload: row.payload,
      }))
      .slice(0, maxItems);

    const sorted = withSort(mapped, (left, right) => left.payload.timestamp - right.payload.timestamp);
    const prepared = iteratorFrom(sorted).map((item) => ({
      ...item,
      runId: item.runId,
    }));

    return ok(prepared);
  }

  public async latestTimeline(
    tenant: ChronicleTenantId,
  ): Promise<Result<ChronicleTimelineEvent | undefined>> {
    const rows = await this.#adapter.repository.listByTenant(tenant);
    const next = rows[0];
    if (!next) {
      return fail(new Error(`No rows for ${tenant}`), 'missing');
    }

    return ok({
      runId: next.runId,
      sequence: 0,
      payload: next.payload,
    });
  }
}

export const createChronicleStreamEngine = (): ChronicleStreamEngine => new ChronicleStreamEngine();

export const collectTimeline = async (
  scenario: { tenant: ChronicleTenantId; route: ChronicleRoute },
  config: ChronicleStreamConfig,
): Promise<Result<ReadonlyArray<ChronicleTimelineEvent>>> => {
  const engine = createChronicleStreamEngine();
  const stream = await engine.streamTenantRuns(scenario.tenant, config);
  if (!stream.ok) return fail(stream.error, stream.code);
  return ok(stream.value);
};

export const runSeedTimeline = async (
  limit = 12,
): Promise<Result<ReadonlyArray<ChronicleTimelineEvent>>> => {
  const engine = createChronicleStreamEngine();
  const timeline = await engine.runMockTimeline(limit);
  return ok(timeline);
};
