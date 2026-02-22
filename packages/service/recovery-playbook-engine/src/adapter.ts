import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { MessageBus, TopicName, SubscribeOptions } from '@platform/messaging';
import { createEnvelope, type MessageId, type Envelope } from '@shared/protocol';
import type { PlaybookSelectionResult, PlanArtifact, OrchestratorState, StageExecution, RunStatus, RecoveryPolicyProfile } from './model';
import type { RecoveryPlaybookRepository } from '@data/recovery-playbook-store';
import type { RecoveryPlaybook } from '@domain/recovery-playbooks';

export interface EventBusAdapter {
  publish(eventName: string, payload: unknown): Promise<void>;
  subscribe(eventName: string, handler: (payload: unknown) => Promise<void>): Promise<void>;
}

export interface PlaybookStoreAdapter {
  savePlan(plan: PlanArtifact): Promise<Result<void, string>>;
  loadPlan(planId: string): Promise<Result<PlaybookSelectionResult, string>>;
  listRecent(tenantId: string, limit: number): Promise<Result<readonly string[], string>>;
}

export interface MetricsAdapter {
  observeDuration(name: string, valueMs: number): void;
  increment(name: string, count?: number): void;
}

export interface PolicyAdapter {
  loadProfiles(): Promise<Result<readonly RecoveryPolicyProfile[], string>>;
  applyProfileHints(runId: string, profileName: string): Promise<Result<void, string>>;
}

export class NoopMetricsAdapter implements MetricsAdapter {
  observeDuration(name: string, valueMs: number): void {
    void name;
    void valueMs;
  }

  increment(name: string, count = 1): void {
    void name;
    void count;
  }
}

export class BusAdapter implements EventBusAdapter {
  private readonly subscriptions: Array<{
    topic: string;
    handler: (payload: unknown) => Promise<void>;
  }> = [];

  constructor(private readonly bus: MessageBus) {}

  async publish(eventName: string, payload: unknown): Promise<void> {
    const topic = this.normalizeTopic(eventName);
    const envelope = createEnvelope(eventName, payload) as Envelope<unknown> & { id: MessageId };
    await this.bus.publish(topic as TopicName, envelope as Envelope<unknown>);
  }

  async subscribe(eventName: string, handler: (payload: unknown) => Promise<void>): Promise<void> {
    const topic = this.normalizeTopic(eventName);
    const options: SubscribeOptions = { topic: topic as TopicName };
    await this.bus.subscribe(options, async (envelope) => {
      await handler(envelope.payload);
    });
    this.subscriptions.push({ topic: String(topic), handler });
  }

  async close(): Promise<void> {
    this.subscriptions.length = 0;
    await Promise.resolve();
  }

  private normalizeTopic(eventName: string): string {
    return `recovery-playbook-engine:${eventName}`;
  }
}

export class MemoryPlanAdapter implements PlaybookStoreAdapter {
  private readonly plans = new Map<string, PlaybookSelectionResult>();
  private readonly artifacts = new Map<string, PlanArtifact>();

  async savePlan(plan: PlanArtifact): Promise<Result<void, string>> {
    this.artifacts.set(plan.id, plan);
    return ok(undefined);
  }


  async loadPlan(planId: string): Promise<Result<PlaybookSelectionResult, string>> {
    const result = this.plans.get(planId);
    if (!result) return fail('plan-not-found');
    return ok(result);
  }

  async listRecent(tenantId: string, limit: number): Promise<Result<readonly string[], string>> {
    void tenantId;
    const ids = [...this.artifacts.keys()].slice(-Math.max(0, limit));
    return ok(ids);
  }
}

export class RepositorySelectionAdapter {
  constructor(private readonly repository: RecoveryPlaybookRepository) {}

  async snapshot(runId: string, playbook: RecoveryPlaybook): Promise<Result<void, string>> {
    const archived = await this.repository.save(playbook);
    if (!archived.ok) return fail(`repository-save-failed:${archived.error}`);
    void runId;
    void archived.value;
    return ok(undefined);
  }
}

export interface OrchestratorStateAdapter {
  save(state: OrchestratorState): Promise<Result<void, string>>;
  load(runId: string): Promise<Result<OrchestratorState | undefined, string>>;
  transition(runId: string, status: RunStatus): Promise<Result<void, string>>;
  snapshot(): Promise<Result<readonly OrchestratorState[], string>>;
}

export class MemoryOrchestratorStateAdapter implements OrchestratorStateAdapter {
  private readonly states = new Map<string, OrchestratorState>();

  async save(state: OrchestratorState): Promise<Result<void, string>> {
    this.states.set(state.run.runId, { ...state });
    return ok(undefined);
  }

  async load(runId: string): Promise<Result<OrchestratorState | undefined, string>> {
    const state = this.states.get(runId);
    if (!state) return ok(undefined);
    return ok({ ...state, stages: [...state.stages] });
  }

  async transition(runId: string, status: RunStatus): Promise<Result<void, string>> {
    const state = this.states.get(runId);
    if (!state) return fail('state-not-found');
    this.states.set(runId, { ...state, status });
    return ok(undefined);
  }

  async snapshot(): Promise<Result<readonly OrchestratorState[], string>> {
    return ok([...this.states.values()]);
  }

  async appendStage(runId: string, stage: StageExecution): Promise<Result<void, string>> {
    const state = this.states.get(runId);
    if (!state) return fail('state-not-found');
    const updated = {
      ...state,
      stages: [...state.stages, stage],
    };
    this.states.set(runId, updated);
    return ok(undefined);
  }
}
