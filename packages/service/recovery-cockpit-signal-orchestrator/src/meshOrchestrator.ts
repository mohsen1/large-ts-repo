import {
  type MeshExecutionPhase,
  type MeshPlan,
  type MeshPlanId,
  type MeshRunId,
  type MeshSpan,
  type MeshEnvelope,
  type MeshEvent,
  type MeshTopology,
  type MeshPluginDefinition,
  createNodeId,
  createRegionId,
  createRunId,
  createSignalId,
  createTenantId,
  toEventName,
  MeshPluginContext,
  toMeshScope,
  MeshPluginRegistry,
} from '@domain/recovery-cockpit-signal-mesh';
import type { SignalMeshRecordStorage } from '@data/recovery-cockpit-signal-mesh-store';
import { InMemorySignalMeshStore } from '@data/recovery-cockpit-signal-mesh-store';
import { phaseEventCount } from '@data/recovery-cockpit-signal-mesh-store';
import { planByPhase, computePlanCoverage } from './planner';
import type { MeshPlanContext, MeshRunSummary } from './planner';
import { runTelemetryLoop, type TelemetryConfig } from './telemetry';

type StackLike = {
  use<T extends { [Symbol.asyncDispose](): Promise<void> }>(resource: T): T;
  adopt<T extends object>(resource: T, onDispose: (value: T) => Promise<void> | void): T;
  [Symbol.asyncDispose](): Promise<void>;
};

type AsyncStackCtor = { new (): StackLike };

const asyncStackCtor = (): AsyncStackCtor => {
  const candidate = (globalThis as unknown as { AsyncDisposableStack?: AsyncStackCtor }).AsyncDisposableStack;
  if (candidate) {
    return candidate;
  }
  return class FallbackAsyncStack implements StackLike {
    readonly #cleanups: Array<() => Promise<void> | void> = [];

    use<T extends { [Symbol.asyncDispose](): Promise<void> }>(resource: T): T {
      this.adopt(resource, () => resource[Symbol.asyncDispose]());
      return resource;
    }

    adopt<T extends object>(resource: T, onDispose: (value: T) => Promise<void> | void): T {
      this.#cleanups.push(() => onDispose(resource));
      return resource;
    }

    async [Symbol.asyncDispose](): Promise<void> {
      for (let index = this.#cleanups.length - 1; index >= 0; index -= 1) {
        await this.#cleanups[index]?.();
      }
    }
  };
};

const AsyncStack = asyncStackCtor();

const phaseOrder: readonly MeshExecutionPhase[] = ['detect', 'assess', 'orchestrate', 'simulate', 'execute', 'observe', 'recover', 'settle'];

const resolveRegistry = async <TPlugins extends readonly MeshPluginDefinition[]>(
  phase: MeshExecutionPhase,
  plugins: TPlugins,
): Promise<MeshPluginRegistry<TPlugins>> => {
  const registry = MeshPluginRegistry.from<TPlugins>(phase);
  for (const plugin of plugins) {
    registry.add(plugin);
  }
  return registry;
};

export interface OrchestratorConfig {
  readonly region: string;
  readonly tenant: string;
  readonly phase: MeshExecutionPhase;
  readonly telemetry: TelemetryConfig;
}

export interface PlanExecutionResult {
  readonly runId: MeshRunId;
  readonly phase: MeshExecutionPhase;
  readonly planId: MeshPlanId;
  readonly emitted: number;
  readonly topologyNodes: number;
  readonly snapshots: readonly MeshEnvelope[];
}

type AnyPlugin = MeshPluginDefinition<
  string,
  unknown,
  unknown,
  unknown,
  MeshPluginContext,
  string,
  MeshExecutionPhase
>;

export class SignalMeshOrchestrator<TPlugins extends readonly AnyPlugin[] = readonly AnyPlugin[]> {
  readonly #plugins: Promise<MeshPluginRegistry<TPlugins>>;
  readonly #store: SignalMeshRecordStorage;
  readonly #config: OrchestratorConfig;
  readonly #summary: MeshRunSummary[];
  readonly #contextCache = new Map<MeshRunId, MeshPlanContext>();

  constructor(config: OrchestratorConfig, plugins: TPlugins, store: SignalMeshRecordStorage = new InMemorySignalMeshStore()) {
    this.#config = config;
    this.#plugins = resolveRegistry(config.phase, plugins);
    this.#store = store;
    this.#summary = [];
  }

  async executePlan(plan: MeshPlan): Promise<PlanExecutionResult> {
    const tenant = createTenantId(this.#config.tenant);
    const region = createRegionId(this.#config.region);
    const runId = createRunId(plan.runId as string);
    const initialSpan: MeshSpan = {
      tenant,
      region,
      phase: this.#config.phase,
      scope: toMeshScope(tenant, region),
      startedAt: new Date().toISOString(),
    };
    const context: MeshPlanContext = {
      tenant: tenant as string,
      region: region as string,
      phase: this.#config.phase,
      runId,
    };
    this.#contextCache.set(runId, context);

    await this.#store.savePlan(runId, plan);
    const emit = runTelemetryLoop(this.#config.telemetry);
    const registry = await this.#plugins;
    const planByPhaseResult = planByPhase(plan, this.#config.phase);
    const coverage = computePlanCoverage(planByPhaseResult);
    const pluginManifests = registry.listByCategory('mesh');

    const events: MeshEvent[] = [];
    for (const plugin of pluginManifests) {
      for (const intent of plan.intents) {
        const eventId = createSignalId(`${tenant as string}:${runId as string}:${intent.id as string}:${plugin.manifest.name}`);
        events.push({
          eventId,
          runId,
          tenant,
          phase: this.#config.phase,
          node: intent.targetNodeIds[0] ?? createNodeId('mesh-node:unknown'),
          name: toEventName(tenant, eventId, `plugin-${plugin.manifest.name}`),
          detail: {
            run: runId,
            plugin: plugin.manifest.name,
            category: plugin.manifest.category,
            enabledByDefault: plugin.manifest.enabledByDefault,
            span: initialSpan,
            phaseWindow: phaseOrder.includes(this.#config.phase),
          },
          at: new Date().toISOString(),
        });
      }
    }

    for (const event of events) {
      await this.#store.appendEvent(runId, event);
      emit(event);
    }

    const snapshots = await this.collectSnapshots(runId);
    const result: PlanExecutionResult = {
      runId,
      phase: this.#config.phase,
      planId: plan.id,
      emitted: events.length,
      topologyNodes: plan.intents.length,
      snapshots,
    };
    this.#summary.push({
      tenant: tenant as string,
      runId,
      phase: this.#config.phase,
      events: events.length,
      planCoverage: coverage,
    });
    return result;
  }

  async collectSnapshots(runId: MeshRunId): Promise<readonly MeshEnvelope[]> {
    const region = createRegionId(this.#config.region);
    const tenant = createTenantId(this.#config.tenant);
    const events = await this.toArray(await this.#store.listEvents(runId, this.#config.phase));
    return events.map((event) => ({
      tenant,
      runId,
      event,
      span: {
        tenant,
        region,
        phase: this.#config.phase,
        scope: `${tenant as string}/${region as string}`,
        startedAt: new Date().toISOString(),
      },
    }));
  }

  async runTopology(plan: MeshTopology): Promise<PlanExecutionResult> {
    const tenant = createTenantId(plan.tenant as string);
    const runId = createRunId(plan.runId as string);
    const planLike: MeshPlan = {
      id: `${runId}:topology` as MeshPlanId,
      tenant,
      runId,
      label: `${tenant as string}-topology`,
      scope: toMeshScope(tenant, createRegionId(plan.region as string)),
      intents: plan.nodes.map((node) => ({
        id: node.id as never,
        tenant,
        runId,
        labels: [node.role],
        phase: this.#config.phase,
        targetNodeIds: [node.id],
        expectedConfidence: 0.9,
        command: `orchestrate:${node.id as string}`,
      })),
      steps: [],
    };
    return this.executePlan(planLike);
  }

  async summarizePlan(plan: MeshPlan): Promise<{ readonly [phase in MeshExecutionPhase]: number }> {
    const events = await this.toArray(await this.#store.listEvents(plan.runId));
    const counts: { [phase in MeshExecutionPhase]: number } = {
      detect: 0,
      assess: 0,
      orchestrate: 0,
      simulate: 0,
      execute: 0,
      observe: 0,
      recover: 0,
      settle: 0,
    };
    for (const phase of Object.keys(counts) as MeshExecutionPhase[]) {
      counts[phase] = phaseEventCount(events, phase);
    }
    return counts;
  }

  get summary(): readonly MeshRunSummary[] {
    return this.#summary;
  }

  async toArray<T>(values: AsyncIterable<T>): Promise<T[]> {
    const out: T[] = [];
    for await (const value of values) {
      out.push(value);
    }
    return out;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    const registry = await this.#plugins;
    await registry[Symbol.asyncDispose]();
    const disposeStore = this.#store[Symbol.asyncDispose];
    if (typeof disposeStore === 'function') {
      await disposeStore.call(this.#store);
    }
  }
}

export const runSignalMesh = async <TPlugins extends readonly AnyPlugin[]>(
  orchestrator: SignalMeshOrchestrator<TPlugins>,
  plan: MeshPlan,
): Promise<PlanExecutionResult> => {
  await using scope = new AsyncStack();
  scope.use({
    [Symbol.asyncDispose]: async () => {
      await orchestrator[Symbol.asyncDispose]();
    },
  });
  return orchestrator.executePlan(plan);
};
