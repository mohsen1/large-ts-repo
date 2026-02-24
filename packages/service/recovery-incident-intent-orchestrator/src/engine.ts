import {
  type OrchestrationInput,
  type OrchestrationOutput,
  buildPolicies,
  normalizeWindow,
} from '@domain/recovery-incident-intent';
import { ok, fail, type Result } from '@shared/result';
import {
  createDispatcherHandle,
  executeWithReport,
  runRecoveryIntent,
  type RuntimeReport,
  type OrchestratorHandle,
  normalizeTenantIntentId,
} from './runtime';

export interface OrchestratorRequest {
  readonly tenantId: string;
  readonly context?: OrchestrationInput['context'];
}

export interface EngineHandle extends OrchestratorHandle {
  readonly tenantId: OrchestrationInput['tenantId'];
}

const normalizeWindowRequest = (tenantId: string): OrchestrationInput => ({
  tenantId: normalizeTenantIntentId(tenantId),
  context: {
    tenantId: normalizeTenantIntentId(tenantId),
    incidentId: `runtime:${tenantId}:tenant`,
    startedAt: new Date().toISOString(),
    affectedSystems: ['api-gateway'],
    severity: 'p2',
    tags: ['engine', 'runtime'],
    meta: {
      owner: 'engine',
      region: 'global',
      team: 'recovery',
    },
  },
  signals: [],
  policies: buildPolicies([
    {
      title: 'engine-default',
      minimumConfidence: 0.5,
      tags: ['engine', 'runtime'],
    },
  ]),
  window: normalizeWindow(),
});

export const createRuntimeHandle = (tenantId: string): EngineHandle => ({
  tenantId: normalizeTenantIntentId(tenantId),
  execute: async (input: OrchestrationInput): Promise<Result<OrchestrationOutput, Error>> => {
    const dispatcher = createDispatcherHandle(normalizeTenantIntentId(input.tenantId));
    const output = await dispatcher.execute(input);
    await dispatcher[Symbol.asyncDispose]();
    return output;
  },
  async [Symbol.asyncDispose](): Promise<void> {
    return Promise.resolve();
  },
});

export const runWithDispatcher = async (
  tenantId: string,
): Promise<Result<OrchestrationOutput, Error>> => {
  const request = normalizeWindowRequest(tenantId);
  const handle = createDispatcherHandle(request.tenantId);
  const output = await handle.execute(request);
  await handle[Symbol.asyncDispose]();
  return output;
};

export const runWithReport = async (
  tenantId: string,
): Promise<Result<RuntimeReport, Error>> => {
  const request = normalizeWindowRequest(tenantId);
  return executeWithReport(request);
};

export const executeWithPolicyDefaults = async (
  tenantId: string,
): Promise<Result<OrchestrationOutput, Error>> => {
  const input = normalizeWindowRequest(tenantId);
  const result = await runRecoveryIntent({
    tenantId: input.tenantId,
    context: input.context,
    signals: input.signals,
    policies: input.policies,
  });
  if (!result.ok) {
    return fail(result.error);
  }
  return ok(result.value);
};
