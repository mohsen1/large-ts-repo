import {
  asScenarioId,
  asTenantId,
  buildTimelineDigest,
  type ScenarioBlueprint,
  type RunId,
  type ScenarioId,
  type TenantId,
  type ScenarioOutput,
} from './contracts';
import { scenarioCatalogParsed } from './contracts';
import { runSyntheticScenario, streamSyntheticScenario } from './registry';

type FixtureEvent = {
  readonly runId: RunId;
  readonly scenarioId: ScenarioId;
  readonly tenant: TenantId;
  readonly outcomes: readonly ScenarioOutput[];
  readonly startedAt: string;
  readonly trace: readonly string[];
};

export class ScenarioFixtureStore implements AsyncDisposable {
  private readonly events = new Map<RunId, FixtureEvent>();

  constructor(private readonly limit = 256) {}

  add(event: FixtureEvent): void {
    this.events.set(event.runId, event);
    if (this.events.size > this.limit) {
      const first = this.events.keys().next().value;
      if (first !== undefined) {
        this.events.delete(first);
      }
    }
  }

  read(runId: RunId): FixtureEvent | undefined {
    return this.events.get(runId);
  }

  recent(limit = 20): readonly FixtureEvent[] {
    return [...this.events.values()].slice(-limit).toReversed();
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.events.clear();
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.events.clear();
  }
}

const fixtureStore = new ScenarioFixtureStore();

export const runFixture = async (scenario: ScenarioBlueprint, actor: string): Promise<FixtureEvent> => {
  const startedAt = new Date().toISOString();
  const completion = await runSyntheticScenario(
    {
      mode: 'simulate',
      actor,
      weights: {
        steps: scenario.steps.length,
      },
    },
    scenario,
    {
      input: scenario.id,
      requestedBy: actor,
      context: {
        actor,
        mode: 'simulate',
      },
    },
  );

  const event: FixtureEvent = {
    runId: completion.envelope.id,
    scenarioId: asScenarioId(scenario.id),
    tenant: asTenantId(scenario.tenant),
    outcomes: [completion.completion.payload],
    startedAt,
    trace: completion.metrics,
  };
  fixtureStore.add(event);
  return event;
};

export const runFixtureSet = async (actor: string): Promise<readonly FixtureEvent[]> => {
  const output: FixtureEvent[] = [];
  for (const scenario of scenarioCatalogParsed) {
    output.push(await runFixture(scenario, actor));
    await Promise.resolve();
  }
  return output;
};

export const listScenariosByTenant = (tenant: TenantId): readonly ScenarioId[] =>
  scenarioCatalogParsed.filter((entry) => entry.tenant === `${tenant}`).map((entry) => asScenarioId(entry.id));

export const scenarioSeverityCount = scenarioCatalogParsed.reduce((acc, scenario) => {
  const current = acc.get(scenario.severity) ?? 0;
  acc.set(scenario.severity, current + 1);
  return acc;
}, new Map<string, number>());

export const scenarioRunAudit = async (tenant: TenantId, actor: string): Promise<Record<string, string>> => {
  const entries = await Promise.all(
    scenarioCatalogParsed
      .filter((scenario) => scenario.tenant === tenant)
      .map(async (scenario) => {
        const frames = await streamSyntheticScenario(scenario, { mode: 'simulate', actor, weights: { tenant } }, {
          input: scenario.id,
          requestedBy: actor,
          context: { actor, mode: 'simulate', tenant },
        });
        const digest = buildTimelineDigest(
          frames
            .filter((entry) => entry.type === 'progress')
            .map((entry) => ({
              at: new Date().toISOString(),
              phase: entry.phase === 'assess' || entry.phase === 'simulate' || entry.phase === 'actuate' || entry.phase === 'verify'
                ? entry.phase
                : 'assess',
              durationMinutes: 1,
              weight: entry.type === 'progress' ? 0.8 : 0.2,
            })),
        );
        return [scenario.id, digest];
      }),
  );

  return Object.fromEntries(entries);
};

export const getRecentFixtureRuns = (): readonly FixtureEvent[] => fixtureStore.recent(16);

export function* withFixtureIterator(tenant: TenantId): Iterable<Promise<FixtureEvent>> {
  for (const scenario of scenarioCatalogParsed.filter((entry) => entry.tenant === tenant)) {
    yield runFixture(scenario, `${tenant}`);
    void Promise.resolve();
  }
}

export const fixtureStoreSize = (): number => scenarioCatalogParsed.length;
