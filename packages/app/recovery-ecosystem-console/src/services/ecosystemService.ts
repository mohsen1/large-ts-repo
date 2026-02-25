import { createPipeline, type PipelineInput, type PipelineResult } from '@service/recovery-ecosystem-orchestrator';
import {
  createServiceRuntime,
  type OrchestratorResult,
  type OrchestratorRunOptions,
  type OrchestratorHydrate,
} from '@service/recovery-ecosystem-orchestrator';
import { useCallback } from 'react';
import { ok, type Result } from '@shared/result';
import type { NamespaceTag, PolicyId } from '@domain/recovery-ecosystem-core';
import { createCommandRuntime, normalizeCommandName } from '@domain/recovery-ecosystem-core';

const runtime = createServiceRuntime({
  timeoutMs: 16,
  retryLimit: 3,
  namespace: 'ecosystem-console-runtime',
});

export const ecosystemRuntime = runtime.orchestrator;

const bootstrapConfig = {
  tenantId: 'tenant:default',
  namespace: 'recovery-ecosystem',
  timestamp: new Date().toISOString(),
};

interface RunDigest {
  readonly tenant: string;
  readonly namespace: string;
  readonly source: 'service' | 'pipeline';
}

interface PluginRunDefinition {
  readonly name: string;
  readonly namespace: NamespaceTag;
  readonly dependsOn: readonly string[];
  readonly tags: readonly `tag:${string}`[];
}

export interface RunCommandInput {
  readonly tenantId: string;
  readonly namespace: string;
  readonly dryRun: boolean;
  readonly policyIds?: readonly string[];
}

export interface EcosystemWorkspace {
  readonly namespace: string;
  readonly snapshotCount: number;
  readonly active: number;
}

export interface EcosystemPluginSummary {
  readonly name: string;
  readonly stageCount: number;
  readonly latencyMs: number;
  readonly healthy: boolean;
}

const normalizeInput = (value: string): string => value.trim().toLowerCase();

const defaultPlugins: readonly PluginRunDefinition[] = [
  {
    name: 'seed-check',
    namespace: 'namespace:seed' as NamespaceTag,
    dependsOn: ['seed'],
    tags: ['tag:seed', 'tag:baseline'],
  },
  {
    name: 'policy-enforce',
    namespace: 'namespace:policy' as NamespaceTag,
    dependsOn: ['seed-check'],
    tags: ['tag:policy', 'tag:compliance'],
  },
  {
    name: 'telemetry-export',
    namespace: 'namespace:telemetry' as NamespaceTag,
    dependsOn: ['policy-enforce'],
    tags: ['tag:telemetry', 'tag:export'],
  },
];

const commandRuntime = createCommandRuntime([], 'namespace:recovery-ecosystem');

type AsyncPipeline = ReturnType<typeof createPipeline>;

export const commandDigest = (definition: PluginRunDefinition): RunDigest => ({
  tenant: 'tenant:default',
  namespace: definition.namespace,
  source: 'pipeline',
});

export const toPluginSummary = (runtimeName: string, plugins: readonly PluginRunDefinition[]): readonly EcosystemPluginSummary[] => {
  const registry = plugins.map((plugin, index) => ({
    name: plugin.name,
    stageCount: 1 + index,
    latencyMs: 120 + index * 35,
    healthy: plugin.tags.includes('tag:seed') || index % 2 === 0,
  }));
  return registry.toSorted((left, right) => right.stageCount - left.stageCount);
};

export const withRetry = async <TValue, TError = unknown>(
  task: () => Promise<TResultWithContext<TValue>>,
  attempts: number,
): Promise<TValue> => {
  const maxAttempts = Math.max(1, attempts);
  const attemptsTrace = Array.from({ length: maxAttempts }, (_value, index) => index + 1);
  let lastError: TError | undefined;

  for (const attempt of attemptsTrace) {
    try {
      const output = await task();
      if (!output.ok) {
        lastError = output.error as unknown as TError;
        continue;
      }
      return output.value;
    } catch (error) {
      lastError = error as TError;
    }
    if (attempt >= maxAttempts) {
      throw lastError;
    }
  }

  throw lastError;
};

const recordPipeline = async (input: RunCommandInput): Promise<OrchestratorRunOptions> => ({
  tenantId: normalizeInput(input.tenantId),
  namespace: normalizeInput(input.namespace),
  dryRun: input.dryRun,
});

const emitCommandSignal = async (input: RunCommandInput): Promise<void> => {
    const commandName = normalizeCommandName('run-plan');
    const command = commandRuntime.dispatch(
      commandName,
      {
        tenantId: input.tenantId,
        namespace: input.namespace,
        policyIds: [...(input.policyIds ?? ['policy:default'])],
      },
      `tenant:${input.tenantId}` as never,
      2,
    );
  await command.catch(() => undefined);
};

export const startEcosystemRun = async (input: RunCommandInput): Promise<OrchestratorResult> => {
  const normalizedInput = await recordPipeline(input);
  await emitCommandSignal(input);
  return ecosystemRuntime.run(normalizedInput).then((result) => {
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  });
};

export const startDryRun = async (tenantId: string, namespace: string): Promise<OrchestratorResult> => {
  const result = await startEcosystemRun({
    tenantId,
    namespace,
    dryRun: true,
  });
  return result;
};

export const hydrateEcosystemRun = async (runId: string): Promise<OrchestratorHydrate | undefined> => {
  const hydrated = await ecosystemRuntime.hydrate(runId);
  if (!hydrated.ok) {
    return undefined;
  }
  return hydrated.value;
};

export const loadWorkspace = async (tenantId: string): Promise<EcosystemWorkspace> => {
  const payload = await ecosystemRuntime.runWorkspace(tenantId);
  return {
    namespace: payload.namespace,
    snapshotCount: payload.snapshotCount,
    active: payload.active,
  };
};

export const loadPipelineWorkspace = async (tenantId: string): Promise<{
  readonly digest: string;
  readonly pluginCount: number;
  readonly namespace: string;
}> => {
  const payload = await ecosystemRuntime.runWorkspace(tenantId);
  const digest = `${payload.namespace}:${payload.snapshotCount}:${payload.active}:${Date.now()}`;
  return {
    digest,
    pluginCount: defaultPlugins.length,
    namespace: payload.namespace,
  };
};

export const runPipeline = async (payload: PipelineInput): Promise<Result<PipelineResult>> => {
  const pipeline = createPipeline(runtime.dependencies.store);
  const result = await pipeline.run({
    tenantId: payload.tenantId,
    namespace: payload.namespace,
    policyIds: payload.policyIds ?? ['policy:standard'],
    dryRun: payload.dryRun,
  });

  if (!result.ok) {
    return result;
  }
  return ok(result.value.result, 'pipeline-run');
};

export const useEcosystemService = () => ({
  start: useCallback(
    (tenantId: string, namespace: string, dryRun = false) =>
      startEcosystemRun({
        tenantId,
        namespace,
        dryRun,
      }),
    [bootstrapConfig.tenantId],
  ),
  hydrate: useCallback((runId: string) => hydrateEcosystemRun(runId), []),
  load: useCallback((tenantId: string) => loadWorkspace(tenantId), []),
  runPipeline,
  pluginSummaries: toPluginSummary('runtime', defaultPlugins),
  bootstrapConfig,
});

type TResultWithContext<TValue> =
  | { readonly ok: true; readonly value: TValue }
  | { readonly ok: false; readonly error: Error };

export const pluginDefinitions = defaultPlugins;

export const policyIdsFromWorkspace = (input: ReadonlyArray<PolicyId>): readonly string[] =>
  input.map((policy) => String(policy));

export const asWorkspaceTenant = (tenant: string): string => normalizeInput(tenant);

export const buildPluginDigest = (definitions: readonly PluginRunDefinition[]): string =>
  definitions.map((definition) => `${definition.name}:${definition.namespace}`).join('::');
