import { ok, fail, type Result } from '@shared/result';
import { makeTopology, buildSampleTopology, sampleTopologyPolicy, type LensTopology } from '@domain/recovery-lens-observability-models';
import { defaultWindowPolicy, type ObserverNamespace, type MetricRecord } from '@domain/recovery-lens-observability-models';
import { runOrchestrator } from './orchestrator';

export interface LensRuntime {
  namespace: ObserverNamespace;
  policy: string;
  bootstrap: readonly string[];
}

export const defaultTopology = (namespace: ObserverNamespace): LensTopology => buildSampleTopology(namespace);

export const bootstrapRuntime = (namespace: ObserverNamespace): LensRuntime => {
  const topology = buildSampleTopology(namespace);
  return {
    namespace,
    policy: sampleTopologyPolicy(namespace),
    bootstrap: topology.nodes.map((node) => String(node.id)),
  };
};

export const runRuntime = async <TPayload extends Record<string, unknown>>(
  namespace: ObserverNamespace,
  points: readonly TPayload[],
): Promise<Result<string, Error>> => {
  const runtime = bootstrapRuntime(namespace);
  const result = await runOrchestrator(namespace, points, runtime.bootstrap);
  return result.ok ? ok(`${result.value.blueprint}:${runtime.policy}`) : fail(result.error);
};

export const executeRuntime = async <TPayload extends Record<string, unknown>>(
  namespace: ObserverNamespace,
  points: readonly TPayload[],
): Promise<Result<{ namespace: ObserverNamespace; policy: string }, Error>> => {
  const result = await runRuntime(namespace, points);
  return result.ok
    ? ok({ namespace, policy: `${defaultWindowPolicy.mode}:${result.value}` })
    : fail(result.error);
};
