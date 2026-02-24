import type { NoInfer } from '@shared/type-level';
import {
  asPlanId,
  asPluginId,
  asRunId,
  asScenarioId,
  asSessionId,
  asWorkspaceId,
  summarizePlan,
  type StrategyContext,
  type StrategyLane,
  type StrategyMode,
  type StrategyPlan,
  type StrategyResult,
  type StrategyTuple,
} from './types';
import type { ServiceRequest } from './service';
import { runIntelligencePlan } from './service';
import { parseStrategyTuple } from './schema';
import { StrategyTelemetry, summarizeEvents } from './telemetry';
import { buildTopology, type TopologyRecord } from './topology';
import { IntelligenceRegistry, runRegistryWalk, registryFingerprint, registryScopeFromTuple } from './insight-registry';
import { runWithTraceBus } from './signal-trace';
import { bootstrapDescriptors } from './bootstrap';

export const orchestrationModes = ['simulate', 'analyze', 'stress', 'plan', 'synthesize'] as const;
export const orchestrationLanes = ['forecast', 'resilience', 'containment', 'recovery', 'assurance'] as const;

export type OrchestrationMode = (typeof orchestrationModes)[number];
export type OrchestrationLane = (typeof orchestrationLanes)[number];

export interface OrchestrationPlan {
  readonly tuple: StrategyTuple;
  readonly topology: ReturnType<typeof buildTopology>;
  readonly route: string;
  readonly labels: readonly string[];
}

export interface OrchestrationOutcome<TOutput = unknown> {
  readonly request: ServiceRequest<Record<string, unknown>>;
  readonly result: StrategyResult<TOutput>;
  readonly timeline: readonly string[];
  readonly eventCount: number;
  readonly registryCount: number;
  readonly planSummary: string;
  readonly registryRoute: string;
  readonly executedTuple: StrategyTuple;
}

interface OrchestrationInput {
  readonly workspace: string;
  readonly tenant: string;
  readonly scenario: string;
  readonly mode: OrchestrationMode;
  readonly lane: OrchestrationLane;
  readonly seed: Record<string, unknown>;
}

type OrchestrationTopology = ReturnType<typeof buildTopology>;

const buildRunContext = (input: OrchestrationInput): StrategyContext => ({
  sessionId: asSessionId(`session:${input.tenant}:${input.workspace}`),
  workspace: asWorkspaceId(input.workspace),
  runId: asRunId(`run:${input.workspace}:${input.scenario}`),
  planId: asPlanId(`plan:${input.workspace}`),
  scenario: asScenarioId(input.scenario),
  phase: {
    phase: input.mode,
    lane: input.lane,
    scenario: asScenarioId(input.scenario),
    runId: asRunId(`phase:${input.workspace}`),
    workspace: asWorkspaceId(input.workspace),
    mode: input.mode,
    startedAt: new Date().toISOString(),
    payload: {
      tuple: bootTuple,
      tenant: input.tenant,
    },
  },
  baggage: {
    workspace: input.workspace,
    tenant: input.tenant,
    lane: input.lane,
  },
  plugin: asPluginId(`plugin:${input.workspace}`),
});

const bootTuple = parseStrategyTuple(['analyze', 'forecast', 'bootstrap', 1] as const);
const bootstrapTopology = createTopologySnapshot();
const bootstrapTopologyRoute = bootstrapTopology.then((topology) => topology.toRouteTrace().join('|'));

const enrichTopologySummary = (record: StrategyPlan): string =>
  `${summarizePlan(record)} | steps=${record.steps.length}`;

export const buildPlan = async (mode: OrchestrationMode, lane: OrchestrationLane): Promise<OrchestrationPlan> => {
  const tuple = parseStrategyTuple([mode, lane, `build-${mode}`, 3] as const);
  const topology = await bootstrapTopology;
  const route = await bootstrapTopologyRoute;
  return {
    tuple,
    topology,
    route,
    labels: tuple.map((entry) => `${entry}`),
  };
};

export const registryForOrchestration = (scope: string): IntelligenceRegistry => {
  const inferredMode = (
    orchestrationModes.includes(scope as OrchestrationMode) ? (scope as OrchestrationMode) : 'analyze'
  ) as OrchestrationMode;
  return new IntelligenceRegistry(
    registryScopeFromTuple([inferredMode, 'forecast', 'scope', 1]),
    bootstrapDescriptors.map((entry) => entry.contract),
  );
};

export const runOrchestration = async <
  TSeed extends Record<string, unknown>,
  TOutput = unknown,
>(
  input: OrchestrationInput & { readonly seed: TSeed; readonly store?: NoInfer<Record<string, unknown>> },
): Promise<OrchestrationOutcome<TOutput>> => {
  const tuple = parseStrategyTuple([input.mode, input.lane, 'run', 1] as const);
  const request: ServiceRequest<TSeed> = {
    workspace: input.workspace,
    scenario: input.scenario,
    mode: input.mode,
    lane: input.lane,
    seed: input.seed,
    tuple,
  };

  const context = buildRunContext(input);
  const registry = registryForOrchestration(input.mode);
  const plan = await buildPlan(input.mode, input.lane);
  const telemetry = new StrategyTelemetry(asSessionId(`session:${input.tenant}`), asRunId(`run:${input.tenant}`));

  const [runResult, traceRun] = await Promise.all([
    runIntelligencePlan<TSeed, TOutput>(request),
    runWithTraceBus('analyze/forecast', `global::${input.tenant}::orchestrator`, async (bus) => {
      await bus.emit({
        id: `start:${input.workspace}`,
        scope: 'global::orchestrator',
        route: 'analyze/forecast',
        severity: 'info',
        payload: {
          tenant: input.tenant,
          mode: input.mode,
          lane: input.lane,
          tuple,
        } satisfies Record<string, unknown>,
      });
      await bus.emit({
        id: `plan:${plan.route}`,
        scope: 'global::orchestrator',
        route: 'plan/assurance',
        severity: 'info',
        payload: {
          topology: plan.route,
          route: plan.topology.toRouteTrace().join('|'),
        } satisfies Record<string, unknown>,
      });
    }),
  ]);

  for (const record of await runRegistryWalk(registry, context)) {
    for (const event of record.diagnostics) {
      telemetry.record(event);
    }
  }

  const summary = summarizeEvents(runResult.result.events);
  const topologySummary = enrichTopologySummary(planPlanFromRun(input.mode, input.lane));
  const events = [
    ...telemetry.toEvents(),
    ...traceRun.events.map((entry) => ({
      source: 'orchestration',
      severity: entry.severity,
      at: entry.at,
      detail: entry.payload,
    })),
  ];
  const timeline = events
    .map((event) => `${event.at}:${event.source}:${event.severity}`)
    .toSorted((left, right) => left.localeCompare(right));

  return {
    request: request as ServiceRequest<Record<string, unknown>>,
    result: {
      ...runResult.result,
      score: Number(((runResult.result.score + summary.errors) / Math.max(1, timeline.length + 1)).toFixed(4)),
    },
    timeline,
    eventCount: events.length,
    registryCount: registry.snapshot().count,
    planSummary: `${topologySummary} | registry=${registryFingerprint('workspace', registry.snapshot().nodes)}`,
    registryRoute: await bootstrapTopologyRoute,
    executedTuple: tuple,
  };
};

export const runPlanSeries = async <TOutput>(
  request: OrchestrationInput,
  repeats = 3,
): Promise<readonly OrchestrationOutcome<TOutput>[]> => {
  const outcomes: OrchestrationOutcome<TOutput>[] = [];
  for (let index = 0; index < repeats; index += 1) {
    outcomes.push(
      await runOrchestration<Record<string, unknown>, TOutput>({
        ...request,
        scenario: `${request.scenario}::${index}`,
        seed: {
          attempt: index,
          requested: new Date().toISOString(),
        },
      }),
    );
  }
  return outcomes;
};

export const topologyFromRegistry = async (contracts: Parameters<typeof registryForOrchestration>[0]): Promise<TopologyRecord> => {
  const registry = registryForOrchestration(contracts);
  return registry.asTopology().map;
};

async function createTopologySnapshot(): Promise<OrchestrationTopology> {
  const topology = buildTopology('recovery-lab-intelligence-orchestrator', [
    {
      name: 'orchestrator-root',
      kind: 'plugin',
      level: 'seed',
      mode: 'analyze',
      lane: 'forecast',
      seed: 1,
      payload: {
        scope: 'global',
      },
    },
    {
      name: 'orchestrator-intake',
      kind: 'metric',
      level: 'analysis',
      mode: 'analyze',
      lane: 'forecast',
      seed: 0.7,
      payload: {
        scope: 'global',
      },
    },
    {
      name: 'orchestrator-exec',
      kind: 'report',
      level: 'execution',
      mode: 'plan',
      lane: 'recovery',
      seed: 0.4,
      payload: {
        scope: 'global',
      },
    },
  ]);
  return topology;
}

const planPlanFromRun = (mode: StrategyMode, lane: StrategyLane): StrategyPlan => {
  return {
    planId: `plan:${mode}:${lane}` as StrategyPlan['planId'],
    sessionId: `session:${mode}:${lane}` as StrategyPlan['sessionId'],
    workspace: 'workspace:recovery-lab-intelligence' as StrategyPlan['workspace'],
    scenario: `scenario:${mode}:${lane}` as StrategyPlan['scenario'],
    title: `${mode}:${lane}:orchestrated`,
    lanes: [lane],
    steps: [],
    metadata: {
      __schema: 'recovery-lab-intelligence-core::runtime',
      mode,
      lane,
      tuple: [mode, lane, 'summarize', 2],
    },
  };
};
