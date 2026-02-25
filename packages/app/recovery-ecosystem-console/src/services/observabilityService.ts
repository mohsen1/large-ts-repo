import type { NamespaceTag } from '@domain/recovery-ecosystem-core';
import { createObservabilityService } from '@service/recovery-ecosystem-orchestrator';
import { createPipeline, type PipelineInput } from '@service/recovery-ecosystem-orchestrator';
import { createServiceRuntime } from '@service/recovery-ecosystem-orchestrator';
import { createInMemoryStore } from '@data/recovery-ecosystem-store';
import type { EcosystemStorePort } from '@data/recovery-ecosystem-store';

const runtime = createServiceRuntime();
const service = createObservabilityService();
const pipeline = createPipeline(createInMemoryStore());

export interface ConsoleObservation {
  readonly namespace: NamespaceTag;
  readonly digest: string;
  readonly recentEventCount: number;
  readonly recentRunCount: number;
}

export interface ObservationInput {
  readonly namespace: NamespaceTag;
  readonly runId: string;
  readonly pipelinePolicyIds?: readonly string[];
}

export const collectConsoleObservations = async (namespace: NamespaceTag, store: EcosystemStorePort = runtime.dependencies.store): Promise<ConsoleObservation> => {
  const snapshots = await service.collect(store, namespace, 30);
  let events: Array<{ readonly event: { readonly at: string }; readonly namespace: NamespaceTag }> = [];
  for await (const event of snapshots) {
    events.push(event);
  }

  const digest = service.digest(namespace, events as never);
  return {
    namespace,
    digest,
    recentEventCount: events.length,
    recentRunCount: new Set(events.map((entry) => entry.namespace)).size,
  };
};

export const runPipelineWithObservation = async ({ namespace, runId, pipelinePolicyIds }: ObservationInput): Promise<ConsoleObservation> => {
  const payload: PipelineInput = {
    tenantId: `tenant:${runId}`,
    namespace: `${String(namespace).replace('namespace:', '')}`,
    policyIds: pipelinePolicyIds ?? ['policy:standard', 'policy:slo'],
  };

  const output = await pipeline.run(payload);
  if (!output.ok) {
    return {
      namespace,
      digest: `error:${output.error.message}`,
      recentEventCount: 0,
      recentRunCount: 0,
    };
  }

    const inspect = await service.inspect(runtime.dependencies.store, namespace, output.value.result.runId);
  const observed = inspect.ok ? inspect.value.values.length : 0;

    return {
      namespace,
      digest: `${namespace}::${runId}::${output.value.result.runId}`,
    recentEventCount: observed,
    recentRunCount: output.value.events.length,
  };
};

export const observeStoreHealth = async (store: EcosystemStorePort): Promise<{ readonly snapshots: number; readonly events: number } & Pick<ConsoleObservation, 'digest'>> => {
  const stats = await store.stats();
  const snapshot = await collectConsoleObservations('namespace:global', store);
  return {
    digest: snapshot.digest,
    snapshots: stats.snapshots,
    events: stats.events,
  };
};

export const commandBusHealth = async (runId: string, namespace: NamespaceTag): Promise<{
  readonly run: string;
  readonly namespace: NamespaceTag;
  readonly policyMatch: boolean;
}> => {
  return {
    run: runId,
    namespace,
    policyMatch: runId.includes('run') && namespace.includes('namespace'),
  };
};
