import { runDigest, digestTopology } from '@domain/recovery-lens-observability-models';
import { defaultWindowPolicy } from '@domain/recovery-lens-observability-models';
import type { LensTopology, MetricRecord } from '@domain/recovery-lens-observability-models';
import { runRuntime } from '@service/recovery-lens-observability-orchestrator';
import type { ObserverNamespace } from '@domain/recovery-lens-observability-models';

export type Digest = ReturnType<typeof digestTopology>;

export const runTopologyDigest = (topology: LensTopology): Digest => {
  return digestTopology(topology);
};

export const inspectTopologyCompact = (topology: LensTopology, points: readonly MetricRecord<Record<string, unknown>>[]) => {
  return runDigest(topology, points);
};

export const triggerOrchestratorRun = async (
  namespace: string,
  topology: LensTopology,
  payloads: readonly Record<string, unknown>[],
) => {
  const runtime = runRuntime;
  const result = await runtime(namespace as ObserverNamespace, payloads);
  return {
    ok: result.ok,
    namespace,
    policy: defaultWindowPolicy,
    digest: inspectTopologyCompact(topology, []),
    payloadCount: payloads.length,
    result,
  };
};
