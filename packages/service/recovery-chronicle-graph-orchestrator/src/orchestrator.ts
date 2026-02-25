import {
  asChronicleGraphRunId,
  asChronicleGraphTenantId,
  summarizeTimeline,
  buildMetricReport,
  asPolicyContext,
  toStrategyTrace,
  buildPhases,
  createHub,
  type ChronicleGraphContext,
  type ChronicleGraphObservation,
  type ChronicleGraphPolicyMode,
  type ChronicleGraphScenario,
  type ChronicleGraphPluginDescriptor,
  type ChronicleGraphRoute,
  type ChronicleGraphRunId,
  type ChronicleGraphStatus,
  type ChronicleGraphTrace,
} from '@domain/recovery-chronicle-graph-core';
import { createRepository, createTimeline, type ChronicleGraphTimeline, type ChronicleGraphTimelineEvent } from '@data/recovery-chronicle-graph-store';
import { createPolicy, routeWeight } from './planner.js';
import { fail, ok, type Result } from '@shared/result';

export interface GraphWorkspaceState {
  readonly runId: ChronicleGraphRunId;
  readonly status: ChronicleGraphStatus;
  readonly route: ChronicleGraphRoute;
  readonly score: number;
  readonly pluginCount: number;
  readonly phases: readonly string[];
  readonly pluginRoutes: readonly ChronicleGraphRoute[];
  readonly phaseCount: number;
}

export interface GraphWorkspaceResult {
  readonly workspace: GraphWorkspaceState;
  readonly events: readonly ChronicleGraphObservation[];
  readonly summary: ReturnType<typeof summarizeTimeline>;
  readonly metrics: ReturnType<typeof buildMetricReport>;
}

export interface OrchestratorRunInput {
  readonly scenario: ChronicleGraphScenario;
  readonly plugins: readonly ChronicleGraphPluginDescriptor[];
  readonly mode: ChronicleGraphPolicyMode;
}

const toWorkspace = (
  scenario: ChronicleGraphScenario,
  status: ChronicleGraphStatus,
  events: readonly ChronicleGraphTimelineEvent[],
  phases: readonly string[],
  score: number,
): GraphWorkspaceState => ({
  runId: asChronicleGraphRunId(scenario.tenant, scenario.route),
  status,
  route: scenario.route,
  score,
  pluginCount: scenario.priorities.length,
  phases,
  pluginRoutes: events.map((event) => scenario.route),
  phaseCount: phases.length,
});

const buildSummary = async (
  scenario: ChronicleGraphScenario,
  trace: ChronicleGraphTrace,
  events: readonly ChronicleGraphObservation[],
): Promise<GraphWorkspaceResult['summary']> => summarizeTimeline(scenario.route, trace.phases, events);

const buildMetrics = async (
  scenario: ChronicleGraphScenario,
  trace: ChronicleGraphTrace,
  events: readonly ChronicleGraphObservation[],
): Promise<GraphWorkspaceResult['metrics']> => buildMetricReport(scenario.route, trace.phases, events);

export const runGraphWorkspace = async (input: OrchestratorRunInput): Promise<Result<GraphWorkspaceResult>> => {
  const repository = createRepository();
  const seeded = await repository.seed(input.scenario, input.scenario.route);
  if (!seeded.ok) return fail(new Error('seed failed'), 'seed');

  const runId = seeded.value;
  const trace = toStrategyTrace({
    tenant: input.scenario.tenant,
    route: input.scenario.route,
    mode: input.mode,
  });

  const context = asPolicyContext(input.scenario.tenant, input.scenario.route, input.scenario.blueprint);
  const hub = createHub(input.plugins);
  const collected: ChronicleGraphObservation[] = [];
  const timelineEngine = createTimeline();
  const policy = createPolicy({
    tenant: input.scenario.tenant,
    route: input.scenario.route,
    mode: input.mode,
  });

  try {
    for await (const observation of hub.run(context, trace)) {
      collected.push(observation);
      await repository.writeEvent(runId, observation);
    }
  } catch (error) {
    await repository.finalizeRun(runId, 'failed', 0);
    return fail(error as Error, 'runtime');
  }

  const generated = await timelineEngine.runScenario(input.scenario, 12);
  const generatedObservations = generated.map((entry) => entry.observation);
  const merged = [...collected, ...generatedObservations];
  await repository.finalizeRun(runId, merged.length > 0 ? 'ok' : 'partial', merged.length);

  const phases = buildPhases(input.mode).map((phase) => String(phase));
  const summary = await buildSummary(input.scenario, { ...trace, phases: buildPhases(input.mode) }, merged);
  const metrics = await buildMetrics(input.scenario, { ...trace, phases: buildPhases(input.mode) }, merged);

  const workspace = toWorkspace(input.scenario, merged.length > 0 ? 'completed' : 'failed', generated, phases, routeWeight(input.scenario.route) + merged.length);

  return ok({
    workspace,
    events: merged,
    summary,
    metrics,
  });
};

export const collectGraphWorkspaces = async (query: {
  readonly tenant: string;
  readonly route: ChronicleGraphRoute;
}): Promise<Result<readonly GraphWorkspaceState[]>> => {
  const timeline = createTimeline();
  const tenantId = asChronicleGraphTenantId(query.tenant);
  const events = await timeline.streamByTenant(tenantId, { route: query.route, maxItems: 40 });
  const grouped = new Map<string, ChronicleGraphTimelineEvent[]>();

  for (const event of events) {
    const key = event.runId;
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  }

  const workspaces: GraphWorkspaceState[] = [...grouped.entries()].map(([runId, value]) => ({
    runId: runId as ChronicleGraphRunId,
    status: value.length > 0 ? 'completed' : 'failed',
    route: query.route,
    score: value.reduce((acc, item) => acc + item.index, 0),
    pluginCount: value.length,
    phases: value.map((item) => item.phase),
    pluginRoutes: [query.route],
    phaseCount: value.length,
  }));

  return ok(workspaces);
};

export const runOrchestrator = async (
  scenario: ChronicleGraphScenario,
  plugins: readonly ChronicleGraphPluginDescriptor[] = [],
  mode: ChronicleGraphPolicyMode = 'balanced',
): Promise<Result<GraphWorkspaceResult>> => {
  return runGraphWorkspace({
    scenario,
    plugins,
    mode,
  });
};
