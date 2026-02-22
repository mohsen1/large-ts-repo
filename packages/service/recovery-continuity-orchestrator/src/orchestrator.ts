import { z } from 'zod';
import { fail, ok, type Result } from '@shared/result';
import { buildScorecard } from '@domain/recovery-continuity-planning';
import {
  ContinuityRunContext,
  ContinuityRunId,
  ContinuityTenantId,
} from '@domain/recovery-continuity-planning';
import { createRunFromInput, InMemoryContinuityPlanStore, type ContinuityPlanStore } from '@data/recovery-continuity-plan-store';
import { createDispatcher, type ContinuityDispatcher } from '@infrastructure/recovery-continuity-adapters';
import { ContinuityRunAssembler, assembleWindow, planInputFromTemplate, type PlanPlanInput } from './planner';

const planInputSchema = z.object({
  tenantId: z.string().min(1),
  requestedRunId: z.string().min(1),
  dryRun: z.boolean().default(false),
  targetServices: z.array(z.string()),
});

export interface ContinuityPlanRecord {
  readonly planId: ContinuityRunId;
  readonly tenantId: string;
}

export interface OrchestratorInput extends z.infer<typeof planInputSchema> {}

export interface ContinuityOrchestrationService {
  runOrchestration(input: OrchestratorInput): Promise<Result<string, Error>>;
  evaluateCandidates(input: PlanPlanInput): Promise<Result<number, Error>>;
}

const formatError = (value: unknown): string => {
  if (value instanceof z.ZodError) return `zod:${value.issues[0]?.message}`;
  return value instanceof Error ? value.message : 'unknown';
};

export class RecoveryContinuityOrchestrator implements ContinuityOrchestrationService {
  private readonly assembler = new ContinuityRunAssembler();

  constructor(
    private readonly repository: ContinuityPlanStore,
    private readonly dispatcher: ContinuityDispatcher,
  ) {}

  async runOrchestration(input: OrchestratorInput): Promise<Result<string, Error>> {
    const parsed = planInputSchema.safeParse(input);
    if (!parsed.success) return fail(new Error(formatError(parsed.error)));

    const allPlans = await this.repository.listByTenant(input.tenantId as unknown as ContinuityTenantId);
    if (!allPlans.ok) return fail(allPlans.error);

    const candidateWindow = await assembleWindow(
      allPlans.value.map((record) => record.plan),
      this.repository,
      input.tenantId as unknown as ContinuityTenantId,
    );
    if (!candidateWindow.ok) return fail(candidateWindow.error);

    if (!candidateWindow.value.candidates.length) {
      return fail(new Error('no-candidates'));
    }

    const top = candidateWindow.value.candidates[0];
    if (!top) return fail(new Error('candidate-not-found'));

    const runTemplate = planInputFromTemplate(input.tenantId as unknown as ContinuityTenantId, `${input.requestedRunId}` as ContinuityRunId, input.targetServices);
    const context = this.assembler.createRun(top, runTemplate);

    const run = createRunFromInput(
      {
        ...runTemplate,
        planId: top.template.id,
        createdAt: new Date().toISOString(),
      },
      context,
      {
        requestor: 'continuity-orchestrator',
        reason: input.dryRun ? 'dry-run' : 'production',
      },
    );

    const metrics = buildScorecard(top.template, context);
    const planRecord = allPlans.value.find((record) => record.plan.id === top.template.id);
    if (!planRecord) return fail(new Error('missing-plan-record'));

    const dispatch = await this.dispatcher.persistAndPublish(this.repository, planRecord, run);
    if (!dispatch.ok) return fail(dispatch.error);

    await this.repository.computePlanMetrics(top.template.id);
    return ok(
      JSON.stringify({
        runId: run.runId,
        tenantId: run.tenantId,
        score: metrics.score,
        confidence: metrics.confidence,
      }),
    );
  }

  async evaluateCandidates(input: PlanPlanInput): Promise<Result<number, Error>> {
    const allPlans = await this.repository.listByTenant(input.tenantId);
    if (!allPlans.ok) return fail(allPlans.error);
    const selected = allPlans.value
      .map((record) => (input.requestedPriority ? record.plan.priority === input.requestedPriority : true))
      .filter(Boolean);
    return ok(selected.length);
  }
}

export const createContinuityOrchestrationService = (
  repository: ContinuityPlanStore,
  dispatcher: ContinuityDispatcher,
): ContinuityOrchestrationService => new RecoveryContinuityOrchestrator(repository, dispatcher);

export const createDefaultOrchestrationService = (
  bucket: string,
  eventBus: string,
): ContinuityOrchestrationService => {
  const repository = new InMemoryContinuityPlanStore();
  const dispatcher = createDispatcher({ s3Bucket: bucket, eventBus });
  return createContinuityOrchestrationService(repository, dispatcher);
};
