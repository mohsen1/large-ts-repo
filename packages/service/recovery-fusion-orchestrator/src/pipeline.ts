import { type Result, fail, ok } from '@shared/result';
import { calculateRiskVector, evaluateBundle, planFusionBundle, rankSignals } from '@domain/recovery-fusion-intelligence';
import type { FusionBundle, FusionPlanRequest } from '@domain/recovery-fusion-intelligence';
import type { FusionBus, FusionStore, FusionMetrics, FusionServiceDeps } from './types';
import type { RecoveryRunState } from '@domain/recovery-orchestration';
import type { RunPlanId, RunSessionId, RunTicketId } from '@domain/recovery-operations-models';

type RunIdLike = string | RecoveryRunState['runId'];

const coerceRunId = (value: RunIdLike): RecoveryRunState['runId'] => value as unknown as RecoveryRunState['runId'];
const coercePlanId = (value: string): RunPlanId => value as unknown as RunPlanId;
const coerceSessionId = (value: string): RunSessionId => value as unknown as RunSessionId;
const coerceTicketId = (value: string): RunTicketId => value as unknown as RunTicketId;

export interface PipelineStage {
  readonly name: string;
  readonly run: (input: PipelineInput) => Promise<Result<PipelineInput, Error>>;
}

export interface PipelineInput {
  readonly request: FusionPlanRequest;
  readonly metrics: FusionMetrics;
  readonly store: FusionStore;
  readonly bus: FusionBus;
  readonly bundle?: FusionBundle;
}

const normalizePlan = (request: FusionPlanRequest): FusionPlanRequest => ({
  ...request,
  waves: request.waves.slice(0, 5),
});

const stagePlan = async (input: PipelineInput): Promise<Result<PipelineInput, Error>> => {
  const plan = planFusionBundle(input.request);
  if (!plan.ok) {
    return fail(plan.error);
  }

  if (!plan.value.accepted) {
    return fail(new Error('plan rejected by planner'));
  }

  const planId = coercePlanId(input.request.planId);
  const runId = coerceRunId(input.request.runId);
  const sessionId = coerceSessionId(`${runId}:session`);
  const ticketId = coerceTicketId(`${runId}:ticket`);

  return ok({
    ...input,
    request: {
      ...input.request,
      waves: plan.value.waveCount > 0 ? input.request.waves : [],
    },
    metrics: {
      ...input.metrics,
      commandCount: input.request.waves.reduce((count, wave) => count + wave.commands.length, 0),
      evaluationCount: plan.value.reasons.length,
    },
    bundle: {
      id: plan.value.bundleId,
      tenant: 'tenant-01',
      runId,
      session: {
        id: sessionId,
        runId,
        ticketId,
        planId,
        status: 'queued',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        constraints: input.request.budget,
        signals: [],
      },
      planId,
      waves: input.request.waves,
      signals: [],
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30_000).toISOString(),
    },
  });
};

const stageEvaluate = async (input: PipelineInput): Promise<Result<PipelineInput, Error>> => {
  const bundle = input.bundle;
  if (!bundle) {
    return fail(new Error('missing bundle'));
  }

  const topology = {
    nodes: bundle.waves.map((wave) => ({
      id: wave.id,
      label: wave.commands.map((command) => command.stepKey).join(','),
      weight: wave.score,
      parents: [],
      children: bundle.waves.filter((nextWave) => nextWave.id !== wave.id).map((nextWave) => nextWave.id),
    })),
    edges: bundle.waves.flatMap((current, index) =>
      index === 0
        ? []
        : [
            {
              from: bundle.waves[index - 1]!.id,
              to: current.id,
              latencyMs: 50,
              riskPenalty: 0.1,
            },
          ],
    ),
  };

  const ranked = evaluateBundle(bundle, topology);
  if (!ranked.ok) {
    return fail(ranked.error);
  }

  const risk = calculateRiskVector(bundle.signals, ranked.value.evaluation.length);
  const waveReadiness = rankSignals(bundle.waves.flatMap((wave) => wave.readinessSignals));

  return ok({
    ...input,
    metrics: {
      ...input.metrics,
      latencyP50: Math.round((risk.severity + risk.confidence) * 100),
      latencyP90: Math.round((risk.riskIndex + waveReadiness) * 200),
      evaluationCount: ranked.value.evaluation.length,
    },
  });
};

const stagePersist = async (input: PipelineInput): Promise<Result<PipelineInput, Error>> => {
  const bundle = input.bundle;
  if (!bundle) {
    return fail(new Error('missing bundle'));
  }

  await input.store.save(bundle);
  await input.bus.send({
    eventId: `bundle-saved:${bundle.id}`,
    eventType: 'bundle_saved',
    tenant: bundle.tenant,
    bundleId: bundle.id,
    occurredAt: new Date().toISOString(),
    payload: { size: bundle.waves.length },
  });
  return ok(input);
};

export const buildPipeline = (_deps: FusionServiceDeps): readonly PipelineStage[] => [
  { name: 'plan', run: stagePlan },
  { name: 'evaluate', run: stageEvaluate },
  { name: 'persist', run: stagePersist },
];

export const runPipeline = async (
  request: FusionPlanRequest,
  deps: FusionServiceDeps,
): Promise<Result<{
  bundle: FusionBundle;
  metrics: FusionMetrics;
}, Error>> => {
  let cursor: PipelineInput = {
    request: normalizePlan(request),
    metrics: {
      latencyP50: 0,
      latencyP90: 0,
      commandCount: 0,
      evaluationCount: 0,
    },
    store: deps.store,
    bus: deps.bus,
  };

  const pipeline = buildPipeline(deps);
  for (const stage of pipeline) {
    const result = await stage.run(cursor);
    if (!result.ok) {
      return fail(result.error);
    }
    cursor = result.value;
  }

  if (!cursor.bundle) {
    return fail(new Error('pipeline completed without bundle'));
  }

  return ok({
    bundle: cursor.bundle,
    metrics: cursor.metrics,
  });
};
