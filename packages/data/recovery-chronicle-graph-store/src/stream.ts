import {
  asChronicleGraphNodeId,
  asChronicleGraphRoute,
  asChronicleGraphRunId,
  asChronicleGraphTenantId,
  asChronicleGraphPhase,
  type ChronicleGraphRunId,
  type ChronicleGraphPhase,
  type ChronicleGraphRoute,
  type ChronicleGraphTenantId,
  type ChronicleGraphObservation,
  type ChronicleGraphScenario,
} from '@domain/recovery-chronicle-graph-core';
import { createRepository, type ChronicleGraphRepository } from './repository.js';
import { createSeedRecordSet } from './records.js';

export interface ChronicleGraphTimelineEvent {
  readonly runId: ChronicleGraphRunId;
  readonly phase: ChronicleGraphPhase;
  readonly index: number;
  readonly observation: ChronicleGraphObservation;
}

export interface ChronicleGraphTimelineOptions {
  readonly tenant?: ChronicleGraphTenantId;
  readonly route?: ChronicleGraphRoute;
  readonly maxItems?: number;
}

const toIteratorArray = <T>(values: Iterable<T>): T[] => {
  const support = (globalThis as { Iterator?: { from?: <U>(value: Iterable<U>) => { toArray: () => U[] } } }).Iterator?.from;
  return support ? support(values).toArray() : [...values];
};

const baselinePhaseScores = [
  { phase: 'bootstrap', score: 10 },
  { phase: 'discovery', score: 20 },
  { phase: 'execution', score: 40 },
  { phase: 'verification', score: 60 },
  { phase: 'recovery', score: 80 },
] as const;

export class ChronicleGraphTimeline {
  readonly #repository: ChronicleGraphRepository;

  public constructor() {
    this.#repository = createRepository();
  }

  public async runScenario(
    scenario: ChronicleGraphScenario,
    maxItems = 20,
  ): Promise<readonly ChronicleGraphTimelineEvent[]> {
    const runId = asChronicleGraphRunId(scenario.tenant, scenario.route);
    const seed = createSeedRecordSet(scenario, scenario.route);
    const seeded = await this.#repository.ensureRun(seed);
    if (!seeded.ok) return [];

    const events: ChronicleGraphTimelineEvent[] = [];
    const phases = scenario.priorities;

    for (let index = 0; index < maxItems; index += 1) {
      const source = baselinePhaseScores[index % baselinePhaseScores.length];
      const observation: ChronicleGraphObservation = {
        id: runId,
        nodeId: asChronicleGraphNodeId(`timeline-${index}`),
        phase: asChronicleGraphPhase(phases[index % phases.length]),
        route: scenario.route,
        tenant: scenario.tenant,
        timestamp: Date.now() + index,
        status: 'running',
        payload: {
          index,
          score: source.score,
          context: `${scenario.title}:${index}`,
        },
      };

      const written = await this.#repository.writeEvent(runId, observation);
      if (!written.ok) continue;
      events.push({
        runId,
        phase: asChronicleGraphPhase(source.phase),
        index,
        observation,
      });
    }

    await this.#repository.finalizeRun(
      runId,
      'ok',
      events.reduce((acc, event) => acc + event.index, 0),
    );
    return events;
  }

  public async streamByTenant(
    tenant: ChronicleGraphTenantId,
    options: ChronicleGraphTimelineOptions = {},
  ): Promise<readonly ChronicleGraphTimelineEvent[]> {
    const route = options.route ?? asChronicleGraphRoute('default');
    const maxItems = options.maxItems ?? 10;
    const records = await this.#repository.listByTenant(tenant);
    const filtered = records.filter((record) => record.context.route === route);
  const events = filtered.flatMap((record) =>
      record.events.map((event, index) => ({
        runId: event.runId,
        phase: event.event.phase,
        index,
        observation: event.event,
      })),
    );

    return toIteratorArray(events).toSorted((left, right) => left.index - right.index).slice(0, maxItems);
  }

  public async latestEvent(route: ChronicleGraphRoute): Promise<ChronicleGraphTimelineEvent | undefined> {
    const records = await this.#repository.listByRoute(route);
    const first = records.at(-1);
    if (!first) return undefined;
    const events = first.events;
    const latest = events.at(-1);
    if (!latest) return undefined;

    return {
      runId: latest.runId,
      phase: latest.event.phase,
      index: events.length,
      observation: latest.event,
    };
  }
}

export const createTimeline = (): ChronicleGraphTimeline => new ChronicleGraphTimeline();

export const collectTimeline = async (
  tenant: string,
  options: ChronicleGraphTimelineOptions = {},
): Promise<readonly ChronicleGraphTimelineEvent[]> => {
  const timeline = createTimeline();
  return timeline.streamByTenant(asChronicleGraphTenantId(tenant), {
    ...options,
    maxItems: options.maxItems ?? 12,
  });
};
