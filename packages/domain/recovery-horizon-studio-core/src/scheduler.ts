import type { PluginStage, JsonLike, HorizonSignal, PluginPayload, TimeMs } from '@domain/recovery-horizon-engine';
import type { JsonValue } from '@shared/type-level';
import type {
  SchedulerTask,
  SchedulerWindow,
  WorkspaceId,
  RunSessionId,
  ProfileId,
  WorkspaceState,
  StageRouteByStage,
} from './types.js';
import { buildTopology } from './topology.js';
import { stageWeights, asTime, asWorkspaceId } from './types.js';
import { PluginRegistry } from './registry.js';
import { horizonBrand } from '@domain/recovery-horizon-engine';
import type { AdapterRegistry, WorkspaceAdapter } from './adapters.js';

interface RunFrame {
  readonly startedAt: TimeMs;
  readonly completed: readonly SchedulerTask[];
}

class SchedulerScope {
  state: WorkspaceState;

  constructor(state: WorkspaceState) {
    this.state = state;
  }

  [Symbol.asyncDispose](): Promise<void> {
    this.state = {
      ...this.state,
      active: false,
    };
    return Promise.resolve();
  }

  [Symbol.dispose](): void {
    this.state = {
      ...this.state,
      active: false,
    };
  }
}

export class StudioScheduler {
  #tasks = new Map<PluginStage, SchedulerTask[]>();
  #registry: PluginRegistry<readonly PluginStage[]>;
  #topology = buildTopology(['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const);
  #history: RunFrame[] = [];

  constructor(
    public readonly workspaceId: WorkspaceId,
    public readonly sessionId: RunSessionId,
    private readonly profileId: ProfileId,
    private readonly adapterRegistry: AdapterRegistry<readonly PluginStage[]>,
    public readonly stages: readonly PluginStage[] = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
  ) {
    this.#registry = new PluginRegistry(stages, profileId);
  }

  get topology() {
    return this.#topology as ReturnType<typeof buildTopology<readonly PluginStage[]>>;
  }

  get isActive() {
    return this.#history.length > 0;
  }

  window(): SchedulerWindow<readonly PluginStage[]> {
    const weighted = stageWeights(this.stages);
    return {
      stages: this.stages,
      totalWeight: weighted.reduce((acc, entry) => acc + entry.weight, 0),
      routeMap: weighted.reduce(
        (acc, entry) => ({
          ...acc,
          [entry.route]: entry.stage,
        }),
        {} as StageRouteByStage<readonly PluginStage[]>,
      ),
      path: weighted.map((entry) => ({ index: entry.weight % this.stages.length, stage: entry.stage })),
    };
  }

  addTask(task: Omit<SchedulerTask, 'id'>): void {
    const list = this.#tasks.get(task.stage) ?? [];
    const nextIndex = list.length + 1;
    const withId = {
      ...task,
      id: `${this.sessionId}-${task.stage}:${nextIndex}` as SchedulerTask['id'],
    };
    this.#tasks.set(task.stage, [...list, withId]);
  }

  async runWorkspace(
    payloads: readonly PluginPayload[],
    stageLimit?: PluginStage,
  ): Promise<readonly HorizonSignal<PluginStage, JsonLike>[]> {
    const state: WorkspaceState = {
      workspaceId: asWorkspaceId(this.workspaceId),
      selectedPlan: undefined,
      active: true,
      stageWindow: stageWeights(this.stages),
      sessionAgeMs: asTime(Date.now()),
    };

    await using scope = new SchedulerScope(state);
    const limitIndex = stageLimit === undefined ? this.stages.length - 1 : this.stages.indexOf(stageLimit);
    const stopAt = limitIndex === -1 ? this.stages.length - 1 : limitIndex;
    const ordered = this.topology.pathStages(stopAt + 1);
    const runAt = asTime(Date.now());
    const emitted: HorizonSignal<PluginStage, JsonLike>[] = [];

    for (const [index, stage] of ordered.entries()) {
      if (index > stopAt) {
        continue;
      }

      const fallbackPayload: PluginPayload = {
        tenantId: this.workspaceId,
        stage,
      };
      const safeIndex = payloads.length > 0 ? index % payloads.length : 0;
      const stagePayload = payloads[safeIndex] ?? fallbackPayload;
      const adapters = this.adapterRegistry.listByStage(stage);
      const signals = await this.#runAdapters(stage, stagePayload, adapters);
      emitted.push(
        ...signals.map((signal) => ({
          ...signal,
          input: {
            ...signal.input,
            runId: horizonBrand.fromRunId(`${this.sessionId}-${index}-${stage}`),
          },
        })),
      );

      this.addTask({
        stage,
        order: index,
        startedAt: runAt,
        windowWeight: this.stages.length - index,
      });
    }

    const historyEntry = {
      startedAt: runAt,
      completed: [...this.#tasks.values()].flat(),
    };
    this.#history = [historyEntry, ...this.#history];
    this.#tasks = new Map();

    return emitted;
  }

  async #runAdapters(
    stage: PluginStage,
    payload: PluginPayload,
    adapters: readonly WorkspaceAdapter<PluginStage>[],
  ): Promise<readonly HorizonSignal<PluginStage, JsonLike>[]> {
    const normalized = adapters.toSorted((left, right) => right.priority - left.priority);
    const outputs: HorizonSignal<PluginStage, JsonLike>[] = [];
    const runAbort = new AbortController();

    for (const adapter of normalized) {
      const records = await adapter.execute(
        [
          {
            pluginKind: stage,
            payload,
            retryWindowMs: horizonBrand.fromTime(1_200),
          },
        ],
        runAbort.signal,
      );

      outputs.push(
        ...records.map((entry) => ({
          ...entry,
          input: {
            ...entry.input,
            tenantId: entry.input.tenantId,
          },
          payload: horizonBrand.fromJson(entry.payload as JsonValue),
        })),
      );
    }

    return outputs;
  }

  history(): readonly RunFrame[] {
    return this.#history.toReversed();
  }

  reset() {
    this.#history = [];
    this.#tasks.clear();
  }
}

export const createScheduler = (
  workspaceId: WorkspaceId,
  sessionId: RunSessionId,
  profileId: ProfileId,
  adapterRegistry: AdapterRegistry<readonly PluginStage[]>,
) => new StudioScheduler(workspaceId, sessionId, profileId, adapterRegistry);

export const estimateWindow = (weights: readonly { readonly route: string; readonly weight: number }[]) =>
  weights.toReversed().map((entry) => `${entry.route}:${entry.weight}`).join(' -> ');
