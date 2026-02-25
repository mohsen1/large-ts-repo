import { PluginRegistry } from '@shared/chronicle-orchestration-protocol';
import {
  buildTopology,
  type StageDescriptor,
  topologyRunEnvelope,
  type TopologyGraph,
} from '@shared/chronicle-orchestration-protocol';
import {
  asChronicleTag,
  asChronicleRoute,
  asChronicleRunId,
  asChronicleTenantId,
  asChroniclePlanId,
  toMetricKey,
  type ChroniclePluginDescriptor,
  type ChronicleRoute,
  type ChronicleRunId,
  type ChronicleTenantId,
  type ChronicleStatus,
} from '@shared/chronicle-orchestration-protocol';
import {
  buildSessionStatus,
  estimateScore,
  initialContext,
  type BlueprintPhase,
  type RunEnvelope,
  type RunEvent,
  type RunGoal,
  type SimulationInput,
  type SimulationOutput,
} from './models';

export interface SimulationContext {
  readonly tenant: ChronicleTenantId;
  readonly route: ChronicleRoute;
  readonly runId: ChronicleRunId;
  readonly status: ChronicleStatus;
  readonly planId: string;
}

export type EventAccumulator<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? [...EventAccumulator<Tail>, Head]
  : [];

export interface SimulationWorkspace {
  readonly registry: PluginRegistry<any>;
  readonly envelope: RunEnvelope;
  readonly goal: RunGoal;
}

const runContext = (tenant: ChronicleTenantId | string, route: ChronicleRoute | string): SimulationContext => {
  const tenantId = asChronicleTenantId(tenant);
  const routeId = asChronicleRoute(route);
  const runId = asChronicleRunId(tenantId, routeId);
  return {
    tenant: tenantId,
    route: routeId,
    runId,
    status: 'queued',
    planId: asChroniclePlanId(tenantId, routeId),
  };
};

const toMetricRecord = (events: readonly RunEvent[]) => ({
  [toMetricKey('score')]: events.reduce((sum, event) => sum + (event.status === 'succeeded' ? 40 : 12), 0),
  [toMetricKey('latency')]: events.length === 0 ? 0 : events.reduce((sum) => sum + 1, 0),
  [toMetricKey('stability')]: Math.min(100, events.length * 10),
});

const toEventTimeline = function* (graph: TopologyGraph, runId: ChronicleRunId, _route: ChronicleRoute) {
  let index = 0;
  for (const phase of graph.nodes) {
    const phaseLabel = phase.phase;
    const status = index === graph.nodes.length - 1 ? 'succeeded' : 'running';
    yield {
      runId,
      phase: phaseLabel as BlueprintPhase,
      status,
      details: `${phase.scope}::${phase.phase}`,
      at: Date.now() + index,
    } satisfies RunEvent;
    index += 1;
  }
};

export const simulateSession = async (
  input: SimulationInput,
  plugins: readonly ChroniclePluginDescriptor[],
): Promise<SimulationOutput> => {
  const context = runContext(input.tenant, input.route);
  const registry = PluginRegistry.create<Record<string, ChroniclePluginDescriptor>>(plugins);
  const limit = input.limit ?? 5;
  const eventBuffer: RunEvent[] = [];
  const topology = buildTopology(context.route, [
    { phase: 'phase:boot', weight: 1 },
    { phase: 'phase:signal', weight: 2 },
    { phase: 'phase:policy', weight: 3 },
    { phase: 'phase:verify', weight: 4 },
    { phase: 'phase:finalize', weight: 5 },
  ]);

  const phaseOrder: readonly BlueprintPhase[] = ['phase:boot', 'phase:signal', 'phase:policy', 'phase:verify', 'phase:finalize'];
  const abortController = new AbortController();
  const envelope: RunEnvelope = {
    id: context.runId,
    tenant: context.tenant,
    route: context.route,
    payload: {
      ...input,
      route: input.route,
      tenant: context.tenant,
      status: context.status,
    },
    createdAt: Date.now(),
    goal: input.goal,
  };

  let score = 0;
  for (const [index, phase] of phaseOrder.entries()) {
    if (index >= limit) break;
    const snapshots = await registry.runPhase({
        phase,
        tenant: context.tenant,
        route: context.route,
        runId: context.runId,
        payload: {
          tenant: context.tenant,
          route: context.route,
          runId: context.runId,
          metadata: { plugin: 'phase-runner' },
          signal: abortController.signal,
          requestedBy: asChronicleTag('orchestrator'),
        },
        signal: abortController.signal,
      },
    );

    for (const snapshot of snapshots) {
      eventBuffer.push({
        runId: context.runId,
        phase,
        status: snapshot.status === 'ready' ? 'running' : snapshot.status === 'failed' ? 'failed' : 'succeeded',
        details: `plugin:${snapshot.pluginId}`,
        at: Date.now(),
      },
    );
      score += snapshot.latencyMs;
    }
  }

  for (const event of toEventTimeline(topology, context.runId, context.route)) {
    eventBuffer.push(event);
  }
  const metrics = toMetricRecord(eventBuffer);
  const outputStatus: ChronicleStatus = eventBuffer.some((entry) => entry.status === 'failed')
    ? 'failed'
    : score > 120
      ? 'succeeded'
      : score > 60
        ? 'degraded'
        : 'running';

  const output: SimulationOutput = {
    runId: context.runId,
    tenant: context.tenant,
    events: eventBuffer,
    metrics,
    status: outputStatus,
    graph: {
      ...topology,
      nodes: topology.nodes,
      edges: topology.edges,
    },
  };

  const snapshot = buildSessionStatus(output);
  void snapshot;
  return output;
};

export const simulateAndRender = async (
  input: SimulationInput,
  plugins: readonly ChroniclePluginDescriptor[],
): Promise<string[]> => {
  const output = await simulateSession(input, plugins);
  const lines = output.events.map((event) => `${event.phase}:${event.status} ${new Date(event.at).toISOString()}`);
  const sorted = lines.toSorted((left, right) => left.localeCompare(right));
  return sorted.toReversed().map((line) => `# ${line}`);
};

export const simulateWithPluginOrder = async (
  input: SimulationInput,
  plugins: readonly ChroniclePluginDescriptor[],
): Promise<SimulationOutput> => {
  const ordered = [...plugins].toSorted((left, right) => left.name.localeCompare(right.name));
  const output = await simulateSession(input, ordered);
  const stages = buildTopology(input.route, [{ phase: 'phase:boot' }, { phase: 'phase:signal' }]);
  for await (const envelope of topologyRunEnvelope(stages, output.runId)) {
    void envelope;
  }
  return output;
};

export const asRunWorkspace = (tenant: ChronicleTenantId, route: ChronicleRoute): SimulationContext => ({
  tenant,
  route,
  runId: asChronicleRunId(tenant, route),
  status: 'queued',
  planId: asChroniclePlanId(tenant, route),
});

export const simulateWorkspace = (input: SimulationInput, plugins: readonly ChroniclePluginDescriptor[]): SimulationWorkspace => {
  const context = asRunWorkspace(asChronicleTenantId(input.tenant), input.route);
  const registry = PluginRegistry.create<Record<string, ChroniclePluginDescriptor>>(plugins);
  return {
    registry,
    envelope: {
      id: context.runId,
      tenant: context.tenant,
      route: context.route,
      payload: {
        tenant: context.tenant,
        route: context.route,
        runId: context.runId,
        goal: input.goal,
      },
      createdAt: Date.now(),
      goal: input.goal,
    },
    goal: input.goal,
  };
};

const summarizePhases = (phases: readonly BlueprintPhase[]): string =>
  phases.map((phase, index) => `${index}:${phase}`).join(',');

const describeGoal = (goal: RunGoal): string => `${goal.kind}:${goal.target}`;

const buildStageDescriptors = (phases: readonly BlueprintPhase[]): readonly StageDescriptor[] =>
  phases.map((phase, index) => ({ phase, weight: index + 1 }));

export const describeSimulation = (input: SimulationInput): { readonly route: string; readonly score: number; readonly weight: number } => {
  const phaseSignature = summarizePhases(['phase:boot', 'phase:signal', 'phase:policy', 'phase:verify', 'phase:finalize']);
  return {
    route: input.route,
    score: estimateScore(input.limit ?? 0, input.goal.target),
    weight: buildStageDescriptors(['phase:boot', 'phase:signal']).reduce((acc, stage) => acc + (stage.weight ?? 0), 0),
  };
};
