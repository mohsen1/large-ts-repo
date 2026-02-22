import { ok, fail } from '@shared/result';
import { createEnvelope, Envelope } from '@shared/protocol';
import { MessageBus, TopicName } from '@platform/messaging';
import {
  buildInitialProgress,
  buildPlanDraft,
  ContinuityCorrelationId,
  ContinuityEventEnvelope,
  ContinuityPlanTemplate,
  ContinuityRuntimePlan,
  ContinuityRunId,
  ContinuityTenantId,
  markStepCompleted,
  markStepStarted,
  nextStepCandidates,
  OrchestrationProgress,
  OrchestrationStepResult,
  normalizePolicy,
  validatePlanTemplate,
  applyProgressTransition,
} from '@domain/continuity-orchestration';
import { InMemoryContinuityJournal } from '@data/continuity-journal';
import { EventBridgePublisher } from './adapter';
import { LaunchRequest, launchRequestSchema, StepCommand, stepCommandSchema } from './schemas';

export interface ServiceDependencies {
  journal?: InMemoryContinuityJournal;
  eventBus?: MessageBus;
  publisher?: EventBridgePublisher;
}

export interface LaunchResult {
  runId: string;
  state: OrchestrationProgress['runState'];
  draftSteps: number;
}

export class ContinuityRuntimeService {
  private readonly journal: InMemoryContinuityJournal;
  private readonly publisher?: EventBridgePublisher;
  private readonly bus?: MessageBus;
  private readonly progress = new Map<string, OrchestrationProgress>();
  private readonly plans = new Map<string, ContinuityRuntimePlan>();

  constructor(deps: ServiceDependencies = {}) {
    this.journal = deps.journal ?? new InMemoryContinuityJournal();
    this.publisher = deps.publisher;
    this.bus = deps.eventBus;
  }

  async launchTemplate(
    input: unknown,
    template: ContinuityPlanTemplate,
    now = new Date().toISOString(),
  ): Promise<{ ok: true; value: LaunchResult } | { ok: false; error: string }> {
    const parsed = launchRequestSchema.safeParse(input);
    if (!parsed.success) return fail('invalid-launch-request');

    const request = parsed.data as LaunchRequest;
    if (request.tenantId !== template.tenantId) return fail('tenant-mismatch');

    const policyCheck = validatePlanTemplate(template);
    if (!policyCheck.ok) {
      return fail(policyCheck.errors.map((error: { code: string }) => error.code).join(','));
    }

    const runId = request.planId as ContinuityRunId;
    const draft = buildPlanDraft(
      {
        ...template,
        policy: normalizePolicy(template.policy),
      },
      { runId, now },
    );
    if (!draft) return fail('invalid-draft');

    const plan: ContinuityRuntimePlan = { ...draft, id: draft.runId };
    await this.journal.save(plan);
    this.plans.set(plan.id, plan);
    const progress = buildInitialProgress(plan);
    const started = applyProgressTransition(progress, 'running');
    this.progress.set(plan.id, started);

    await this.publish({
      runId: plan.id,
      tenantId: plan.tenantId,
      eventType: 'plan.started',
      when: new Date().toISOString(),
      correlationId: plan.correlationId,
      payload: { requestedBy: request.requestedBy, dryRun: request.dryRun },
    });

    return ok({ runId: plan.id, state: started.runState, draftSteps: draft.steps.length });
  }

  async commandStep(input: unknown): Promise<boolean> {
    const parsed = stepCommandSchema.safeParse(input);
    if (!parsed.success) return false;
    const command = parsed.data as StepCommand;
    const state = this.progress.get(command.runId);
    if (!state) return false;
    const plan = this.plans.get(command.runId);
    if (!plan) return false;

    if (command.command === 'cancel') {
      this.progress.set(command.runId, applyProgressTransition(state, 'cancelled'));
      await this.publish({
        runId: command.runId as ContinuityRunId,
        tenantId: plan.tenantId,
        eventType: 'plan.finished',
        when: new Date().toISOString(),
        correlationId: plan.correlationId,
        payload: { command: command.command },
      });
      return true;
    }

    if (command.command === 'skip') {
      const result: OrchestrationStepResult = {
        stepId: command.stepId,
        ok: true,
        message: 'manual skip',
        retriable: false,
      };
      this.progress.set(command.runId, markStepCompleted(state, result));
      return true;
    }

    if (command.command === 'start' || command.command === 'retry') {
      const candidates = nextStepCandidates(state, plan.steps);
      if (candidates.includes(command.stepId)) {
        this.progress.set(command.runId, markStepStarted(state, command.stepId));
        return true;
      }
    }

    return false;
  }

  async getRun(runId: string) {
    const run = await this.journal.get(runId as never);
    return run;
  }

  private async publish(envelope: {
    runId: ContinuityRunId;
    tenantId: ContinuityTenantId;
    eventType: 'plan.started' | 'plan.finished';
    when: string;
    correlationId: ContinuityCorrelationId;
    payload: Record<string, unknown>;
  }) {
    const event: ContinuityEventEnvelope<Record<string, unknown>> = {
      runId: envelope.runId,
      tenantId: envelope.tenantId,
      eventType: envelope.eventType,
      when: envelope.when,
      correlationId: envelope.correlationId,
      payload: envelope.payload,
    };

    const plan = this.plans.get(envelope.runId);
    if (plan) {
      await this.journal.save(plan, event);
    }

    if (this.publisher) {
      await this.publisher.publish(event);
    }
    if (this.bus) {
      const topic: TopicName = `${envelope.eventType}` as TopicName;
      await this.bus.publish(topic, createEnvelope(topic, event));
    }
  }
}
