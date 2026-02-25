import { useMemo, type ReactElement } from 'react';
import { FabricTopologyPanel } from '../components/FabricTopologyPanel';
import { FabricPolicyCard } from '../components/FabricPolicyCard';
import { FabricRunInspector } from '../components/FabricRunInspector';
import { useRecoveryLensTopology } from '../hooks/useRecoveryLensTopology';
import { useRecoveryLensRun } from '../hooks/useRecoveryLensRun';
import { runTopologyDigest, type Digest } from '../services/lensObservabilityService';

const titleForNamespace = (namespace: string): string => `Lens Observability · ${namespace}`;

export const RecoveryLensObservabilityPage = ({
  namespace = 'tenant:recovery-lens',
}: {
  namespace?: string;
}): ReactElement => {
  const topology = useRecoveryLensTopology(namespace);
  const runState = useRecoveryLensRun(namespace);
  const digest = useMemo<Digest>(() => runTopologyDigest(topology), [topology]);

  return (
    <main>
      <header>
        <h1>{titleForNamespace(namespace)}</h1>
        <p>Run status: {runState.running ? 'running' : 'idle'}</p>
        <p>Digest ratio: {digest.averageWeight.toFixed(2)}</p>
      </header>

      <section>
        <h2>Topology diagnostics</h2>
        <FabricTopologyPanel namespace={namespace} />
      </section>

      <section>
        <h2>Policy controls</h2>
        <FabricPolicyCard namespace={namespace} />
      </section>

      <section>
        <h2>Run inspector</h2>
        <FabricRunInspector namespace={namespace} />
      </section>

      <section>
        <h2>Recent run</h2>
        <p>{runState.last || 'no runs yet'}</p>
      </section>
    </main>
  );
};
