import { useMemo, type ReactElement } from 'react';
import { summarizeTopology, routeTemplate } from '@domain/recovery-lens-observability-models';
import { useRecoveryLensRun } from '../hooks/useRecoveryLensRun';
import { useRecoveryLensTopology } from '../hooks/useRecoveryLensTopology';
import type { LensTopology } from '@domain/recovery-lens-observability-models';

export const FabricTopologyPanel = ({ namespace }: { readonly namespace: string }): ReactElement => {
  const topology = useRecoveryLensTopology(namespace);
  const run = useRecoveryLensRun(namespace);

  const summary = useMemo(() => {
    const seed = summarizeTopology(topology);
    return {
      topology,
      nodes: seed.nodeCount,
      edges: seed.edgeCount,
      ratio: seed.averageWeight.toFixed(2),
    };
  }, [topology]);

  return (
    <section>
      <h2>Lens topology</h2>
      <p>Namespace: {namespace}</p>
        <p>Catalog route: {routeTemplate.realtime}</p>
      <p>
        Nodes: {summary.nodes} Edges: {summary.edges} Avg: {summary.ratio}
      </p>
      <div>
        <button type="button" onClick={() => void run.triggerRun()}>
          Run topology refresh
        </button>
      </div>
    </section>
  );
};
