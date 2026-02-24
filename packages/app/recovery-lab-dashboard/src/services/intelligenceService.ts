import {
  runOrchestration,
  buildPlan,
  runPlanSeries,
  type OrchestrationOutcome,
  type OrchestrationMode,
  type OrchestrationLane,
  orchestrationModes,
  orchestrationLanes,
} from '@domain/recovery-lab-intelligence-core';
import type {
  StrategyMode,
  StrategyLane,
  StrategyTuple,
} from '@domain/recovery-lab-intelligence-core';
import {
  asLabTenantId,
  asLabRunId,
  asLabScenarioId,
} from '@shared/recovery-lab-kernel';
import type { RecoveryLabStore } from '@data/recovery-lab-simulation-store';
import { MemoryRecoveryLabStore } from '@data/recovery-lab-simulation-store';

const defaultModes = orchestrationModes as readonly OrchestrationMode[];
const defaultLanes = orchestrationLanes as readonly OrchestrationLane[];

const bootstrapStore: RecoveryLabStore = new MemoryRecoveryLabStore();
const ready = Promise.resolve({
  loadedAt: new Date().toISOString(),
  tenant: 'tenant:recovery-lab-intelligence-dashboard',
  modes: defaultModes,
  lanes: defaultLanes,
});

interface RunSeed {
  readonly tenant: string;
  readonly scenario: string;
  readonly mode: OrchestrationMode;
  readonly lane: OrchestrationLane;
  readonly tuple?: StrategyTuple;
  readonly extra: Record<string, unknown>;
  readonly repeats?: number;
}

export interface IntelligenceServiceState {
  readonly mode: OrchestrationMode;
  readonly lane: OrchestrationLane;
  readonly tuple: StrategyTuple;
  readonly timeline: readonly string[];
  readonly planSummary: string;
  readonly registryCount: number;
  readonly eventCount: number;
  readonly registryRoute: string;
  readonly summary: {
    readonly eventCount: number;
    readonly outputScore: number;
    readonly outputRoutes: readonly string[];
  };
  readonly seedRuns: readonly OrchestrationOutcome[];
}

export const strategyModeLabels: Record<OrchestrationMode, string> = {
  simulate: 'simulate',
  analyze: 'analyze',
  stress: 'stress',
  plan: 'plan',
  synthesize: 'synthesize',
} as const;

export const strategyLaneLabels: Record<OrchestrationLane, string> = {
  forecast: 'forecast',
  resilience: 'resilience',
  containment: 'containment',
  recovery: 'recovery',
  assurance: 'assurance',
} as const;

export const resolveTuple = (
  mode: StrategyMode,
  lane: StrategyLane,
  anchor = 1,
): StrategyTuple =>
  [
    mode === 'plan' ? 'simulate' : (mode as StrategyMode),
    lane,
    `anchor-${String(anchor)}`,
    anchor,
  ] as StrategyTuple;

const normalizeTuple = (tuple: StrategyTuple): StrategyTuple => {
  const [mode, lane, source, count] = tuple;
  const safeMode = (defaultModes.includes(mode as OrchestrationMode)
    ? (mode as OrchestrationMode)
    : 'analyze') as OrchestrationMode;

  const safeLane = (defaultLanes.includes(lane as OrchestrationLane)
    ? (lane as OrchestrationLane)
    : 'forecast') as OrchestrationLane;

  return [safeMode, safeLane, source, Math.max(1, count)] as StrategyTuple;
};

export const runWorkspaceIntelligence = async (seed: RunSeed): Promise<IntelligenceServiceState> => {
  const readyState = await ready;
  const tuple = normalizeTuple(seed.tuple ?? resolveTuple(seed.mode, seed.lane));
  const workspace = `workspace:${seed.tenant}`;
  const store = bootstrapStore;

  const request = {
    workspace,
    tenant: seed.tenant,
    scenario: seed.scenario,
    mode: seed.mode,
    lane: seed.lane,
    seed: {
      requestedAt: readyState.loadedAt,
      source: 'dashboard',
      tenant: seed.tenant,
      tuple,
      ...seed.extra,
    },
  };

  const [singleResult, history] = await Promise.all([
    runOrchestration(request),
    runPlanSeries<any>(
      {
        workspace,
        tenant: seed.tenant,
        scenario: seed.scenario,
        mode: seed.mode,
        lane: seed.lane,
        seed: request.seed,
      },
      seed.repeats ?? 2,
    ),
  ]);

  const topPlan = await buildPlan(seed.mode, seed.lane);
  const output = singleResult.result.output as Record<string, unknown>;
  const outputRoutes = Object.keys(output).map((key) => `${key}=${String(output[key])}`);

  const tenantSnapshot = await store.queryStore({ tenant: asLabTenantId(seed.tenant) });
  const runId = asLabRunId(`run:${seed.tenant}:${seed.mode}:${seed.lane}`);

  return {
    mode: singleResult.request.mode as OrchestrationMode,
    lane: singleResult.request.lane as OrchestrationLane,
    tuple: singleResult.executedTuple,
    timeline: [...singleResult.timeline],
    planSummary: `${topPlan.labels.length}:${singleResult.planSummary}`,
    registryCount: singleResult.registryCount,
    eventCount: singleResult.eventCount,
    registryRoute: singleResult.registryRoute,
    summary: {
      eventCount: history.reduce((acc, entry) => acc + entry.eventCount, 0),
      outputScore: singleResult.result.score,
      outputRoutes,
    },
    seedRuns: [singleResult, ...history],
  };
};

export const hydrateScenarioIds = (tenant: string): readonly string[] => {
  return [
    `${asLabScenarioId(`${tenant}:seed`)}--0`,
    `${asLabScenarioId(`${tenant}:seed`)}--1`,
    `${asLabScenarioId(`${tenant}:seed`)}--2`,
  ];
};

export const summarizeRuns = (outcomes: readonly OrchestrationOutcome[]): {
  readonly avgScore: number;
  readonly maxEvents: number;
  readonly minEvents: number;
  readonly lanes: readonly string[];
  readonly scenarios: readonly string[];
} => {
  const minEvents = outcomes.reduce<number>((acc, outcome) => Math.min(acc, outcome.eventCount), Number.MAX_SAFE_INTEGER);
  const maxEvents = outcomes.reduce<number>((acc, outcome) => Math.max(acc, outcome.eventCount), 0);
  const avgScore = outcomes.length === 0 ? 0 : outcomes.reduce((acc, outcome) => acc + outcome.result.score, 0) / outcomes.length;
  const laneSet = new Set<string>();
  const scenarioSet = new Set<string>();

  for (const outcome of outcomes) {
    laneSet.add(outcome.request.lane);
    scenarioSet.add(outcome.request.scenario);
  }

  return {
    avgScore,
    maxEvents,
    minEvents: minEvents === Number.MAX_SAFE_INTEGER ? 0 : minEvents,
    lanes: [...laneSet].toSorted(),
    scenarios: [...scenarioSet].toSorted(),
  };
};

export const parseRunTarget = (value: string): string => {
  const normalized = value.trim();
  if (!normalized) {
    return asLabRunId('run:recovery-lab-intelligence').toString();
  }
  return asLabRunId(`run:${normalized}`).toString();
};

export const runSeedDefaults: Readonly<RunSeed> = {
  tenant: 'tenant-default',
  scenario: 'scenario-default',
  mode: 'analyze',
  lane: 'forecast',
  tuple: ['analyze', 'forecast', 'dashboard', 1],
  repeats: 2,
  extra: {
    source: 'ui',
    priority: 1,
  },
};
