import { ok, fail, type Result } from '@shared/result';
import {
  asCommandPlanId,
  asCommandResultId,
  asCommandTraceId,
  asCommandTag,
  asStreamId,
  CommandPlan,
  CommandExecutionContext,
  CommandPolicy,
  CommandPlanId,
  CommandRunContext,
  CommandRunResult,
  CommandSignalRecord,
  CommandTenantId,
  parseCommandPolicy,
  parseCommandPlan,
  summarizeByNamespace,
  scoreFromEnvelopes,
} from '@domain/streaming-command-intelligence';
import {
  InMemoryCommandIntelligenceStore,
  summarizeByTenant as summarizeByTenantQuery,
} from '@data/streaming-command-intelligence-store';
import { toCommandSignalRecord, toStoreRecord } from './adapter';
import { CommandIntelligencePipeline } from './pipeline';

type CommandIntelligenceOrchestratorStack = {
  readonly namespace: string;
  readonly mode: string;
};

export interface CommandIntelligenceOrchestrationInput {
  readonly tenantId: CommandTenantId;
  readonly streamId: string;
  readonly policy: CommandPolicy;
  readonly rawPlan: unknown;
  readonly store: InMemoryCommandIntelligenceStore;
}

export interface CommandIntelligenceOrchestrationOutput {
  readonly ok: boolean;
  readonly runId: CommandPlanId;
  readonly status: CommandRunResult['status'];
  readonly profile: {
    readonly namespaceCounts: Record<string, number>;
    readonly avgWarnings: number;
  };
  readonly planId: CommandPlanId;
  readonly commandCount: number;
  readonly summary: string;
}

const asOrchestrationStack = (): CommandIntelligenceOrchestratorStack => ({
  namespace: 'streaming-command-intelligence',
  mode: 'pipeline',
});

const buildRunContext = (plan: CommandPlan, tenantId: CommandTenantId): CommandExecutionContext => ({
  tenantId,
  streamId: plan.streamId,
  traceId: asCommandTraceId(`trace:${plan.planId}:${Date.now()}`),
  runId: plan.planId,
  pluginName: plan.name,
  attempt: 1,
  startedAt: new Date().toISOString(),
});

export const runCommandIntelligence = async (
  input: CommandIntelligenceOrchestrationInput,
): Promise<Result<CommandIntelligenceOrchestrationOutput>> => {
  await using _scope = {
    [Symbol.asyncDispose]() {
      return Promise.resolve();
    },
  } satisfies AsyncDisposable;

  try {
    const namespaceStack = asOrchestrationStack();
    const policy = input.policy?.id ? input.policy : parseCommandPolicy(input.policy);
    const plan = parseCommandPlan(input.rawPlan);
    const pipeline = new CommandIntelligencePipeline();

    const context = buildRunContext(plan, input.tenantId);
    const envelopes = await pipeline.execute(plan, {
      tenantId: input.tenantId,
      streamId: asStreamId(input.streamId),
      namespacePolicy: policy.allowedNamespaces,
      planId: plan.planId,
    });

    const warnings = envelopes
      .filter((envelope) => envelope.context?.status === 'failed')
      .map((envelope) => `${envelope.context?.pluginName ?? 'unknown'} failed`);

    const namespaceCounts = summarizeByNamespace(envelopes);

  const runResult: CommandRunResult = {
      status: warnings.length ? 'failed' : 'succeeded',
      traceId: context.traceId,
      resultId: asCommandResultId(`result:${plan.planId}`),
      streamId: plan.streamId,
      output: envelopes,
      score: scoreFromEnvelopes(warnings),
      warnings,
      tags: [
        asCommandTag(`policy:${policy.name}`),
        asCommandTag(`namespace:${policy.allowedNamespaces.join(',')}`),
      ],
      metadata: {
        tenantId: input.tenantId,
        policyId: policy.id,
        namespaceCount: Object.keys(namespaceCounts).length,
      },
    };

    const signalRecords: CommandSignalRecord[] = envelopes.map((envelope, index) =>
      toCommandSignalRecord({
        tenantId: envelope.tenantId,
        streamId: envelope.streamId,
        namespace: envelope.namespace,
        traceId: envelope.traceId,
        pluginId: envelope.context?.pluginId ?? `auto:${plan.planId}:${index}`,
        pluginName: envelope.context?.pluginName ?? `plugin:${index}`,
        stepId: `step-${index}`,
        payload: envelope.payload as Record<string, unknown>,
      }),
    );

    const summary = await summarizeByTenantQuery(input.store, input.tenantId);
    const runContext: CommandRunContext = {
      tenantId: input.tenantId,
      streamId: asStreamId(input.streamId),
      planId: plan.planId,
      status: runResult.status,
      startedAt: new Date().toISOString(),
      commandCount: plan.plugins.length,
    };

    const storeRecord = toStoreRecord({
      runId: plan.planId,
      tenantId: input.tenantId,
      streamId: asStreamId(input.streamId),
      plan,
      result: runResult,
      events: signalRecords,
    });

    await input.store.save(storeRecord);
    const appendResult = await input.store.appendResults(plan.planId, runContext, runResult, signalRecords);
    if (!appendResult.ok) {
      return fail(new Error(`failed to persist command intelligence result for ${plan.planId}`));
    }

    return ok({
      ok: true,
      runId: plan.planId,
      status: runResult.status,
      profile: {
        namespaceCounts,
        avgWarnings: summary.avgWarnings,
      },
      planId: plan.planId,
      commandCount: plan.plugins.length,
      summary: `${namespaceStack.namespace}/${namespaceStack.mode}:${plan.name}:${policy.name}`,
    });
  } catch (error) {
    return fail(error instanceof Error ? error : new Error('command intelligence orchestration failed'));
  }
};
