import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { InMemoryBus, type MessageBus } from '@platform/messaging';
import { Tracer, measure } from '@platform/observability';
import { guard, InMemoryAudit } from '@platform/security';
import { fail, ok, type Result } from '@shared/result';
import { isExpired } from '@shared/protocol';
import { type NewFailureSignal, type FailureActionPlan, type FailureSignal, type FailureSignalId } from '@domain/failure-intelligence';
import { createSignalIdentity, type FailureSignal as FailureSignalType } from '@domain/failure-intelligence';
import { draftPlan } from './planner';
import { FailureBusAdapter } from './adapters/bus';
import { FailureEventBridgeAdapter } from './adapters/eventbridge';
import { InMemoryFailureIntelligenceRepository, type FailureIntelligenceRepository } from '@data/failure-intelligence-store';
import { type IntakeReturn, type PlanReturn, type RunReturn, type OrchestrationError, type RunnerSnapshot, type IntakeResult, type RunResult } from './types';

type WindowStore = Map<string, number>;

export interface FailureRunnerOptions {
  namespace: string;
  bus?: MessageBus;
  repository?: FailureIntelligenceRepository;
  actor?: string;
}

export class FailureIntelligenceRunner {
  private readonly bus: MessageBus;
  private readonly repository: FailureIntelligenceRepository;
  private readonly busAdapter: FailureBusAdapter;
  private readonly eventBridge: FailureEventBridgeAdapter;
  private readonly audit = new InMemoryAudit();
  private readonly tracer = new Tracer();
  private readonly seen: WindowStore = new Map();
  private readonly metrics: RunnerSnapshot = { receivedSignals: 0, plannedActions: 0, failedRuns: 0 };

  constructor(options: FailureRunnerOptions = { namespace: 'failure-intelligence' }) {
    this.bus = options.bus ?? new InMemoryBus();
    this.repository = options.repository ?? new InMemoryFailureIntelligenceRepository();
    this.busAdapter = new FailureBusAdapter(this.bus, options.namespace);
    this.eventBridge = new FailureEventBridgeAdapter(new EventBridgeClient({}), {
      source: `${options.namespace}-events`,
      busName: options.namespace,
    });

    void guard(this.audit, 'runner', 'start', options.actor ?? 'system');
  }

  async ingest(raw: unknown): Promise<IntakeReturn> {
    const record = await measure(this.tracer, 'runner.ingest', () => this.repository.ingestSignal(raw));
    if (!record.ok) {
      this.metrics.failedRuns += 1;
      return fail(this.toError('schema', record.error.message));
    }

    const signal = record.value;
    await this.busAdapter.publishSignal(signal);
    await this.eventBridge.publishSignal(signal);
    this.seen.set(String(signal.id), Date.now());
    this.metrics.receivedSignals += 1;
    return ok({ signalCount: this.seen.size, signalIds: [signal.id] });
  }

  async planAll(rawQuery: unknown): Promise<PlanReturn> {
    const stored = await this.repository.querySignals(rawQuery);
    if (!stored.ok) return fail(this.toError('store', stored.error.message));

    const signals = stored.value.filter((signal) => !isExpired({
      id: signal.id as any,
      correlationId: signal.id as any,
      timestamp: signal.createdAt,
      eventType: 'failure.signal.ingested',
      payload: signal,
    }));

    const draft = draftPlan(signals);
    if (!draft) {
      return fail(this.toError('policy', 'no-plan-produced'));
    }

    const persisted = await this.repository.persistPlan(draft.plan);
    if (!persisted.ok) return fail(this.toError('store', persisted.error.message));

    await this.busAdapter.publishPlan(persisted.value);
    await this.eventBridge.publishPlan(persisted.value);
    this.metrics.plannedActions += persisted.value.actions.length;
    return ok(persisted.value);
  }

  async run(raw: NewFailureSignal): Promise<RunReturn> {
    const ingest = await this.ingest(raw);
    if (!ingest.ok) {
      return fail({ code: ingest.error.code, message: ingest.error.message, cause: ingest.error });
    }

    const query = {
      tenantId: String(raw.tenantId),
      from: Date.now() - 10 * 60_000,
      to: Date.now(),
      limit: 200,
    };

    const plan = await this.planAll(query);
    if (!plan.ok) {
      return ok({
        signalId: String(raw.tenantId),
        signal: this.asFailureSignal(raw),
        outcome: 'awaiting-more-signals',
      });
    }

    return ok({
      signalId: String(raw.tenantId),
      signal: this.asFailureSignal(raw),
      outcome: 'planned',
    });
  }

  getMetrics(): RunnerSnapshot {
    return { ...this.metrics };
  }

  private asFailureSignal(raw: NewFailureSignal): FailureSignalType {
    const id = createSignalIdentity(raw);
    return {
      id,
      source: raw.source as any,
      tenantId: raw.tenantId,
      shape: raw.shape,
      component: raw.component,
      severity: raw.severity,
      message: raw.message,
      context: raw.context,
      payload: raw.payload,
      createdAt: new Date().toISOString(),
      occurredAt: new Date().toISOString(),
      history: [Date.now()],
      tags: ['orchestrated'],
    };
  }

  private toError(code: OrchestrationError['code'], message: string): OrchestrationError {
    return { code, message };
  }
}

export const createFailureIntelligenceRunner = (namespace = 'failure-intelligence'): FailureIntelligenceRunner =>
  new FailureIntelligenceRunner({ namespace });
