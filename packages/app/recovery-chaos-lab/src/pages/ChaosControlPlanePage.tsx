import { useMemo } from 'react';
import { useChaosControlPlane } from '../hooks/useChaosControlPlane';
import { useChaosSignalFeed } from '../hooks/useChaosSignalFeed';
import { ChaosControlPlaneOverview } from '../components/ChaosControlPlaneOverview';
import { ChaosTopologyPulses } from '../components/ChaosTopologyPulses';
import { ChaosSignalTile } from '../components/ChaosSignalTile';
import { connectedComponents, normalizeTopology, type TopologyNode, type TopologyEdge } from '@domain/recovery-chaos-sim-models';
import type { ChaosRunState } from '@service/recovery-chaos-orchestrator';

const demoNodes: readonly TopologyNode[] = [
  { id: 'control.ingress', label: 'control', flavor: 'control', state: 'ready', capacity: 1 },
  { id: 'app.compute', label: 'app', flavor: 'compute', state: 'ready', capacity: 1 },
  { id: 'db.storage', label: 'db', flavor: 'storage', state: 'degraded', capacity: 1 }
];

const demoEdges: readonly TopologyEdge[] = [
  {
    from: 'control.ingress',
    to: 'app.compute',
    weight: 0.75,
    active: true,
    flavor: 'network'
  },
  {
    from: 'app.compute',
    to: 'db.storage',
    weight: 0.25,
    active: false,
    flavor: 'storage'
  }
];

export function ChaosControlPlanePage() {
  const plane = useChaosControlPlane({
    namespace: 'recovery-ops',
    profileIndex: 1,
    dryRun: true,
    windowMs: 15_000
  });

  const feed = useChaosSignalFeed({
    namespace: 'recovery-ops',
    profileIndex: 1,
    windowMs: 15_000
  });

  const components = useMemo(() => {
    const normalized = normalizeTopology(demoNodes, demoEdges);
    const groups = connectedComponents(demoNodes, demoEdges);
    return { normalized, groups, nodes: demoNodes, edges: demoEdges };
  }, []);

  const state = (plane.lastResult?.report.status && {} as ChaosRunState) ?? null;

  return (
    <main>
      <h1>Chaos Control Plane</h1>
      <section>
        <button onClick={plane.run} type="button" disabled={plane.loading}>
          Run control plane
        </button>
        <button onClick={plane.reset} type="button">
          Reset
        </button>
      </section>
      <section>
        <ChaosControlPlaneOverview
          namespace="recovery-ops"
          windowMs={plane.windowMs}
          running={plane.loading}
          state={state}
          result={plane.lastResult}
          onRefresh={plane.run}
        />
      </section>
      <section>
        <ChaosTopologyPulses nodes={components.nodes} edges={components.edges} />
      </section>
      <section>
        <ChaosSignalTile namespace="recovery-ops" events={feed.events} maxRows={6} />
      </section>
      <pre>{JSON.stringify(components.groups, null, 2)}</pre>
      <section>
        <p>Topology summary: {components.normalized.nodes.length} nodes / {components.normalized.edges.length} edges</p>
        <p>Signal queue length: {feed.events.length}</p>
      </section>
    </main>
  );
}
