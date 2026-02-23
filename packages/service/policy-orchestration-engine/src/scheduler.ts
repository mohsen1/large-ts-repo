import { InMemoryPolicyStore } from '@data/policy-orchestration-store';
import { PolicyExecutionDigest, PolicyPlan } from '@domain/policy-orchestration';
import { Edge, NodeId } from '@shared/core';
import { PolicyNode, OrchestrationNodeId } from '@domain/policy-orchestration';

export interface CadenceWindow {
  startedAt: string;
  expectedCompletionAt: string;
  maxSkewSeconds: number;
}

export interface CadenceState {
  cadenceId: string;
  status: 'active' | 'paused' | 'stopped';
  queueDepth: number;
  completedAt: string[];
}

interface ScheduledItem {
  id: string;
  plan: PolicyPlan;
  scheduleAt: number;
  windows: CadenceWindow[];
}

export class PolicyCadenceScheduler {
  private readonly queue: ScheduledItem[] = [];
  private readonly seen = new Set<string>();

  constructor(private readonly store: InMemoryPolicyStore, private readonly cadenceId: string) {}

  enqueue(plan: PolicyPlan): void {
    const item: ScheduledItem = {
      id: `${this.cadenceId}:${plan.id}`,
      plan,
      scheduleAt: Date.now() + 30_000,
      windows: plan.steps.map((step) => ({
        startedAt: new Date().toISOString(),
        expectedCompletionAt: new Date(Date.now() + step.estimatedLatencyMs).toISOString(),
        maxSkewSeconds: Math.max(1, step.maxConcurrency),
      })),
    };
    this.queue.push(item);
    this.queue.sort((left, right) => left.scheduleAt - right.scheduleAt);
  }

  async tick(now: number, onReady: (plan: PolicyPlan) => Promise<void>): Promise<void> {
    while (this.queue.length > 0 && this.queue[0].scheduleAt <= now) {
      const item = this.queue.shift();
      if (!item || this.seen.has(item.id)) continue;
      this.seen.add(item.id);
      await onReady(item.plan);
    }
  }

  async publishDigest(plan: PolicyPlan): Promise<PolicyExecutionDigest> {
    const runs = await this.store.run.listByPlan(plan.id as string);
    const succeeded = runs.filter((run) => run.status === 'succeeded').length;
    const failed = runs.filter((run) => run.status === 'failed').length;
    const retried = runs.filter((run) => run.status === 'running').length;

    return {
      planId: plan.id,
      startedAt: new Date().toISOString(),
      elapsedMs: runs.length === 0 ? 0 : runs.reduce((acc, item) => acc + (Number(item.metrics?.['elapsedMs']) || 0), 0),
      waves: plan.steps.map((step) => ({
        wave: step.order,
        nodes: [] as readonly PolicyNode[],
        edges: [] as readonly Edge<NodeId, { fromDependency: OrchestrationNodeId; weight: number }>[],
      })),
      summary: {
        totalNodes: plan.steps.reduce((acc, item) => acc + item.nodeIds.length, 0),
        succeeded,
        failed,
        retried,
      },
    };
  }

  async health(): Promise<CadenceState> {
    const runs = await this.store.run.listByPlan(this.cadenceId);
    const completed = runs.filter((run) => run.status === 'succeeded' || run.status === 'failed').map((run) => run.id);
    return {
      cadenceId: this.cadenceId,
      status: this.queue.length > 0 ? 'active' : 'stopped',
      queueDepth: this.queue.length,
      completedAt: completed,
    };
  }
}
