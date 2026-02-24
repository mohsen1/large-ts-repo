import { clearInterval, setInterval } from 'node:timers';
import { withBrand } from '@shared/core';
import type { DesignPlan, DesignPlanId, DesignScenarioId, DesignStage, DesignTenantId, DesignWorkspaceId } from './contracts';
import { designStageWeights } from './contracts';
import { buildDesignGraph, buildGraphLanes, summarizeGraph } from './graph-lens';
import { DesignPluginHub } from './plugin-hub';
import { DesignPlanStore, type StoredPlanRow } from './plan-history';

export interface DesignTask {
  readonly taskId: string;
  readonly planId: DesignPlanId;
  readonly tenantId: DesignTenantId;
  readonly workspaceId: DesignWorkspaceId;
  readonly scenarioId: DesignScenarioId;
  readonly stage: DesignStage;
  readonly createdAt: number;
  readonly timeoutMs: number;
}

export interface SchedulerResult {
  readonly planId: DesignPlanId;
  readonly pluginCount: number;
  readonly outputs: Readonly<Record<string, unknown>>;
  readonly lanes: readonly string[];
  readonly graphId: string;
}

export interface RuntimeSchedulerConfig {
  readonly maxConcurrency: number;
  readonly queueWindowMs: number;
}

interface QueueEntry {
  readonly taskId: string;
  readonly task: DesignTask;
  readonly startedAt: number;
}

export interface SchedulerRuntimeState {
  readonly queueDepth: number;
  readonly running: number;
}

const toWorkflowPhase = (stage: DesignStage): 'collect' | 'plan' | 'verify' | 'execute' | 'close' =>
  stage === 'intake'
    ? 'collect'
    : stage === 'design'
      ? 'plan'
      : stage === 'validate'
        ? 'verify'
        : stage === 'execute'
          ? 'execute'
          : 'close';

export class DesignScheduler {
  #queue: DesignTask[] = [];
  #running = new Map<string, QueueEntry>();
  #timer: ReturnType<typeof setInterval> | null = null;
  #disposed = false;

  constructor(
    private readonly hub: DesignPluginHub,
    private readonly store: DesignPlanStore,
    private readonly config: RuntimeSchedulerConfig = { maxConcurrency: 2, queueWindowMs: 80 },
  ) {
    this.#timer = setInterval(() => {
      void this.pulse();
    }, this.config.queueWindowMs);
  }

  get state(): SchedulerRuntimeState {
    return {
      queueDepth: this.#queue.length,
      running: this.#running.size,
    };
  }

  queueSnapshot(): readonly DesignTask[] {
    return [...this.#queue].toSorted((left, right) => {
      const priority = designStageWeights[left.stage] ?? 0;
      const rightPriority = designStageWeights[right.stage] ?? 0;
      return rightPriority - priority || right.createdAt - left.createdAt;
    });
  }

  enqueue(task: DesignTask): DesignTask {
    this.#queue.push(task);
    return task;
  }

  async enqueuePlan(plan: {
    readonly planId: DesignPlanId;
    readonly tenantId: DesignTenantId;
    readonly workspaceId: DesignWorkspaceId;
    readonly scenarioId: DesignScenarioId;
    readonly stage: DesignStage;
  }): Promise<DesignTask> {
    const task: DesignTask = {
      taskId: withBrand(`${plan.planId}:${plan.stage}`, 'DesignTask'),
      planId: plan.planId,
      stage: plan.stage,
      tenantId: plan.tenantId,
      workspaceId: plan.workspaceId,
      scenarioId: plan.scenarioId,
      createdAt: Date.now(),
      timeoutMs: 420,
    };
    return this.enqueue(task);
  }

  async pulse(): Promise<void> {
    if (this.#running.size >= this.config.maxConcurrency || this.#disposed) {
      return;
    }
    const candidate = this.queueSnapshot().at(0);
    if (!candidate) {
      return;
    }
    this.#queue = this.queueSnapshot().filter((entry) => entry.taskId !== candidate.taskId);
    this.#running.set(candidate.taskId, {
      taskId: candidate.taskId,
      task: candidate,
      startedAt: Date.now(),
    });
    try {
      await this.runTask(candidate);
    } finally {
      this.#running.delete(candidate.taskId);
    }
  }

  async runTask(task: DesignTask): Promise<SchedulerResult> {
    const row = this.store.get(task.planId);
    const plan = this.denormalizeStoredPlan(row);
    const graph = buildDesignGraph({
      planId: task.planId,
      name: `seed-${task.planId}`,
      stage: task.stage,
      nodes: [],
    });
    const summary = summarizeGraph(graph, {
      runId: task.planId,
      workspaceId: task.workspaceId,
      phase: toWorkflowPhase(task.stage),
    });
    const laneNames = buildGraphLanes(graph).map((lane) => lane.name);
    const pluginResult = await this.hub.runByStage(task.stage, {
      planId: task.planId,
      tenantId: task.tenantId,
      workspaceId: task.workspaceId,
      stage: task.stage,
      now: new Date(task.createdAt).toISOString(),
    }, {
      runId: task.planId,
      startedAt: new Date().toISOString(),
      plan,
      requestId: task.taskId,
    });

    if (row) {
      await this.store.appendEvent(task.planId, 'completed', {
        graph: summary.graphId,
        pluginCount: pluginResult.pluginCount,
      });
      await this.store.upsert({
        ...row,
        state: 'complete',
        updatedAt: Date.now(),
        tags: [...row.tags, 'complete'],
      });
    }

    return {
      planId: task.planId,
      pluginCount: pluginResult.pluginCount,
      outputs: pluginResult.outputs,
      lanes: laneNames,
      graphId: summary.graphId,
    };
  }

  denormalizeStoredPlan(row: StoredPlanRow<unknown> | undefined): DesignPlan {
    const stage = row?.stage ?? 'intake';
    const source = row
      ? ({
          planId: row.planId,
          tenantId: row.tenant as DesignTenantId,
          workspaceId: row.workspace as DesignWorkspaceId,
          scenarioId: withBrand(`${row.tenant}:${row.scenario}`, 'DesignScenarioId'),
          stage,
          createdAt: new Date(row.createdAt).toISOString(),
          updatedAt: new Date(row.updatedAt).toISOString(),
          state: row.state,
          steps: ['intake', 'design', 'validate'],
          tags: row.tags,
          confidence: 0.64,
          metadata: row.metadata,
        } as DesignPlan)
      : ({
          planId: withBrand('missing:missing:missing', 'DesignPlanId'),
          tenantId: withBrand('tenant-missing', 'DesignTenantId'),
          workspaceId: withBrand('workspace-missing', 'DesignWorkspaceId'),
          scenarioId: withBrand('tenant-missing:scenario-missing', 'DesignScenarioId'),
          stage,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          state: 'queued',
          steps: [],
          tags: [],
          confidence: 0.35,
          metadata: { source: 'fallback' },
        } as DesignPlan);
    return { ...source, tags: [...source.tags] };
  }

  [Symbol.dispose](): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
    this.#running.clear();
    this.#queue = [];
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this[Symbol.dispose]();
  }
}
