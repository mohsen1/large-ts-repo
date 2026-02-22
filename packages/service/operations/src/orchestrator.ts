import { EventBridgeRunPublisher, InMemoryOperationsRepository } from './adapters';
import { normalizeOperationWindow } from './scheduler';
import { assessQuality, validateRequest } from './quality';
import {
  OperationsCommand,
  OperationsInputPayload,
  OperationsRun,
  OperationsRequestId,
  OperationsDecision,
  buildRequestId,
  OperationsRepository,
  buildCorrelationId,
  RuntimeContext,
} from './models';
import {
  BuildPlanInput,
  OperationPlan,
  buildDraft,
  createPolicy,
  shapePlan,
  selectSignalsForWindow,
  PlanTemplate,
} from '@domain/operations-orchestration';
import { MessageBus, InMemoryBus } from '@platform/messaging';
import { IncidentRepository, InMemoryIncidentStore } from '@data/incident-hub';

export interface OrchestratorInput {
  bus: MessageBus;
  repository: OperationsRepository;
  incidentRepo: IncidentRepository;
}

export interface OrchestrationResult {
  id: OperationsRequestId;
  ok: boolean;
  planId?: string;
  audit: readonly string[];
  score: number;
}

const mapSeverityPenalty = (severity: OperationsCommand['severity']): number =>
  severity === 'critical' ? 10 : severity === 'major' ? 6 : 2;

export const createOperationsOrchestrator = (input: OrchestratorInput) => {
  const eventBridge = new EventBridgeRunPublisher({ busName: 'ops-events', region: 'us-east-1' });
  const publisher = async (plan: OperationPlan) => {
    const envelope = {
      kind: 'operations.plan.created',
      requestId: plan.id as any,
      tenantId: plan.environmentId as any,
      payload: { planId: plan.id },
      initiatedAt: new Date().toISOString(),
    };
    await eventBridge.publish(envelope);
  };

  const publishAudit = async (run: OperationsRun, event: string) => {
    const now = new Date().toISOString();
    await input.incidentRepo.appendSnapshot({
      id: `${run.id}:snapshot:${now}` as any,
      tenantId: run.command.tenantId as any,
      serviceId: 'operations' as any,
      title: `operations:${event}`,
      details: `plan=${run.plan?.id ?? 'n/a'}`,
      state: 'monitoring',
      triage: {
        tenantId: run.command.tenantId as any,
        serviceId: 'operations' as any,
        observedAt: now,
        source: 'ops-auto',
        severity: 'sev3',
        labels: [],
        confidence: 1,
        signals: [],
      },
      createdAt: now,
      updatedAt: now,
    });
  };

  return async (command: OperationsInputPayload): Promise<OrchestrationResult> => {
    const requestValidation = validateRequest(command);
    if (!requestValidation.ok) {
      return { id: `${command.tenantId}:invalid` as OperationsRequestId, ok: false, audit: ['invalid payload'], score: 0 };
    }

    const context: RuntimeContext = {
      requestId: buildRequestId(command.tenantId),
      correlationId: buildCorrelationId(command.tenantId),
      requestedAt: new Date().toISOString(),
      locale: 'en-US',
    };

    const signals = command.signals ?? [];
    const policies: readonly PlanTemplate[] = [
      createPolicy({
        tenantId: command.tenantId,
        policyName: 'default',
        maxWindowConcurrent: 3,
        blockedSeverities: [],
        allowedRegions: ['us-east-1'],
        minHealthyPercent: 80,
      }),
    ];

    const quality = assessQuality(command);
    const decision: OperationsDecision = {
      allowed: quality.passed && requestValidation.ok,
      reasons: [quality.reason, ...policies.map((policy) => policy.policyName)],
      score: quality.quality + mapSeverityPenalty(command.severity),
    };

    const draft: BuildPlanInput = {
      deploymentId: command.deploymentId,
      runbookId: command.runbookId,
      window: normalizeOperationWindow(command.window),
      baseSteps: [],
      dependencies: [],
      constraints: {},
      severity: command.severity,
      tenantId: command.tenantId,
    };

    const planResult = shapePlan(context.requestId, buildDraft(draft), signals, policies);
    if (!planResult.ok) {
      return { id: context.requestId, ok: false, audit: ['planner-rejected'], score: decision.score };
    }

    const run: OperationsRun<Record<string, unknown>> = {
      id: planResult.value.plan.id,
      requestId: context.requestId,
      command: command,
      decision,
      signals,
      createdAt: context.requestedAt,
      window: command.window,
      plan: planResult.value.plan as OperationPlan<Record<string, unknown>>,
    };

    const saved = await input.repository.upsert(run);
    if (!saved.ok) {
      return { id: context.requestId, ok: false, audit: ['repo-save-failed'], score: decision.score };
    }

    await publisher(planResult.value.plan);
    await publishAudit(run, decision.allowed ? 'approved' : 'rejected');
    await input.bus.publish('operations.events' as any, {
      kind: 'operations.run.recorded',
      requestId: context.requestId,
      tenantId: run.command.tenantId as any,
      payload: run,
      initiatedAt: run.createdAt,
    } as any);

    return {
      id: context.requestId,
      ok: true,
      planId: run.id,
      audit: [...decision.reasons, `signals=${selectSignalsForWindow(signals, command.severity).length}`],
      score: decision.score,
    };
  };
};

export const bootstrapOperationsOrchestrator = (): ReturnType<typeof createOperationsOrchestrator> => {
  return createOperationsOrchestrator({
    bus: new InMemoryBus(),
    repository: new InMemoryOperationsRepository(),
    incidentRepo: new InMemoryIncidentStore(),
  });
};
