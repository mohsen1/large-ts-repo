import { withBrand } from '@shared/core';
import { fail, ok, type Result } from '@shared/result';
import {
  buildExecutionManifest,
  buildPlanSlots,
  isReadyToRun,
  assignState,
  toEnvelope,
  segmentSummary,
} from '@domain/recovery-operations-models';
import type { RunPlanSnapshot, RecoverySignal } from '@domain/recovery-operations-models';
import {
  buildBatchAssessment,
  aggregateByTenantAndRun,
} from '@domain/recovery-operations-intelligence';
import { runIntelligencePipeline, type PipelineOutput } from './pipeline';
import { buildScenarioInsights } from '@domain/recovery-operations-intelligence';
import { normalizeIncomingPayload } from '@domain/recovery-operations-intelligence';
import type { RecoveryReadinessPlan, } from '@domain/recovery-readiness';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { IntelligenceRepository } from '@data/recovery-operations-intelligence-store';
import type { OperationsPolicyHook } from '@domain/recovery-operations-models';
import type { RecoveryRiskSignal } from '@domain/recovery-operations-intelligence';

export interface RuntimeInput {
  readonly tenant: string;
  readonly runId: string;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly plan: RunPlanSnapshot;
  readonly rawSignals: readonly unknown[];
  readonly repositories: {
    operations: RecoveryOperationsRepository;
    intelligence: IntelligenceRepository;
  };
}

export interface RuntimeSnapshot {
  readonly tenant: string;
  readonly runId: string;
  readonly output: PipelineOutput;
  readonly score: number;
  readonly sessionId: string;
  readonly manifestId: string;
  readonly reports: readonly string[];
}

export interface RuntimeExecutionContext {
  readonly tenant: string;
  readonly runId: string;
  readonly hooks: readonly OperationsPolicyHook<RuntimeSnapshot>[];
  readonly repositories: {
    operations: RecoveryOperationsRepository;
    intelligence: IntelligenceRepository;
  };
}

const signalWindow = (
  tenant: string,
  readinessPlan: RecoveryReadinessPlan,
  signals: readonly RecoverySignal[],
): readonly RecoveryRiskSignal[] =>
  signals.map((signal, index) => ({
    runId: withBrand(`${tenant}-run-${index}`, 'IntelligenceRunId'),
    envelopeId: `runtime:${tenant}:${index}`,
    source: 'queue',
    signal,
    window: {
      tenant: withBrand(tenant, 'TenantId'),
      from: new Date(Date.now() - 30_000).toISOString(),
      to: new Date().toISOString(),
      zone: readinessPlan?.windows?.[0]?.timezone ?? 'UTC',
    },
    tags: ['runtime', signal.source, `${readinessPlan?.riskBand ?? 'green'}`],
  }));

const runCoordinatorHooks = async (
  hooks: readonly OperationsPolicyHook<RuntimeSnapshot>[],
  snapshot: RuntimeSnapshot,
): Promise<Result<number, string>> => {
  for (const hook of hooks) {
    const allowed = await hook.invoke(snapshot);
    if (!allowed) {
      return fail(`hook.${hook.hookName}.blocked`);
    }
  }
  return ok(hooks.length);
};

const buildReports = (
  tenant: string,
  output: PipelineOutput,
  manifestSummary: string,
): readonly string[] => {
  const insight = buildScenarioInsights(tenant, output.runId, output.score, []);
  return [
    `tenant:${tenant}`,
    `run:${output.runId}`,
    `batch:${output.batchRisk}`,
    `score:${output.score.toFixed(3)}`,
    `assessments:${output.assessments.length}`,
    `insights:${insight.length}`,
    `manifest:${manifestSummary}`,
  ];
};

export const executeRuntime = async (
  input: RuntimeInput,
  context: RuntimeExecutionContext,
): Promise<Result<RuntimeSnapshot, string>> => {
  const parsedSignals = normalizeIncomingPayload(input.rawSignals);
  const rawSignals = parsedSignals.map((item) => item.signal);
  const manifest = buildExecutionManifest(input.tenant, input.plan, rawSignals);
  const envelope = toEnvelope(manifest, input.tenant);
  const slots = buildPlanSlots(input.tenant, manifest).map((slot) => (isReadyToRun(slot) ? slot : assignState(slot, 'pending')));
  const manifestSummary = segmentSummary(manifest);
  const windows = signalWindow(input.tenant, input.readinessPlan, rawSignals);

  await input.repositories.operations.upsertSession({
    id: withBrand(`${input.tenant}-${input.runId}`, 'RunSessionId'),
    runId: withBrand(input.runId, 'RecoveryRunId'),
    ticketId: withBrand(`${input.tenant}-ticket-${input.runId}`, 'RunTicketId'),
    planId: manifest.planId,
    status: 'queued',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    constraints: manifest.budget,
    signals: rawSignals,
  });

  const pipelineInput = {
    tenant: input.tenant,
    runId: withBrand(input.runId, 'IntelligenceRunId'),
    readinessPlan: input.readinessPlan,
    signals: windows,
  };

  const pipelineResult = await runIntelligencePipeline(pipelineInput, context.repositories);
  if (!pipelineResult.ok) {
    return fail(pipelineResult.error);
  }
  const batch = buildBatchAssessment(aggregateByTenantAndRun(windows));

  await input.repositories.intelligence.saveBatchAssessment(withBrand(input.tenant, 'TenantId'), {
    cohort: batch.cohort,
    generatedAt: batch.generatedAt,
    overallRisk: batch.overallRisk,
  });

  const snapshot: RuntimeSnapshot = {
    tenant: input.tenant,
    runId: input.runId,
    output: pipelineResult.value,
    score: pipelineResult.value.score,
    sessionId: String(envelope.manifestId),
    manifestId: String(envelope.manifestId),
    reports: buildReports(input.tenant, pipelineResult.value, manifestSummary),
  };

  const hooks = await runCoordinatorHooks(context.hooks, snapshot);
  if (!hooks.ok) {
    return fail(hooks.error);
  }

  if (slots.length < 1 || batch.overallRisk === 'red') {
    return fail('RUNTIME_NOTHING_TO_RUN');
  }

  return ok(snapshot);
};
