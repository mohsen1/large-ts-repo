import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { SignalMeshTopologyGraph } from '../components/mesh/SignalMeshTopologyGraph';
import { SignalMeshStatusBoard } from '../components/mesh/SignalMeshStatusBoard';
import { SignalMeshCommandConsole } from '../components/mesh/SignalMeshCommandConsole';
import { useSignalMesh } from '../hooks/useSignalMeshOrchestration';
import type { MeshEnvelope, MeshExecutionPhase, MeshNode } from '@domain/recovery-cockpit-signal-mesh';

export function RecoveryCockpitSignalMeshPage(): ReactElement {
  const { topology, snapshots, intents, signals, commands, loading, reload, dispatchCommand } = useSignalMesh();
  const [selectedNode, setSelectedNode] = useState<string | undefined>(undefined);
  const [selectedPhase, setSelectedPhase] = useState<MeshExecutionPhase | undefined>(undefined);
  const selected = useMemo(
    () => signals.find((item) => selectedNode !== undefined && item.id === (selectedNode as string)),
    [selectedNode, signals],
  );
  const filteredSnapshots = useMemo(
    () =>
      selectedPhase === undefined ? snapshots : snapshots.filter((snapshot: MeshEnvelope) => snapshot.event.phase === (selectedPhase as never)),
    [selectedPhase, snapshots],
  );
  const selectedCommand = useMemo(() => commands.find((entry) => entry.startsWith('mesh:')) ?? 'run', [commands]);

  return (
    <main>
      <h1>Recovery Cockpit Signal Mesh</h1>
      <button type="button" onClick={reload}>
        Refresh
      </button>
      <p>{loading ? 'Loading...' : `Loaded ${signals.length} signals and ${snapshots.length} snapshots.`}</p>
      <SignalMeshStatusBoard
        snapshots={filteredSnapshots}
        selectedPhase={selectedPhase}
        onPhaseSelect={(phase) => setSelectedPhase((prev) => (prev === phase ? undefined : phase))}
      />
      <SignalMeshTopologyGraph
        topology={topology}
        selectedNode={selectedNode}
        onSelectNode={(node: MeshNode) => setSelectedNode(node.id)}
        onHoverNode={(node: MeshNode) => {
          if (node.health < 20) {
            console.debug(`degraded node ${node.id}`);
          }
        }}
      />
      {selected === undefined ? (
        <section>
          <p>Select a node to inspect command lane.</p>
        </section>
      ) : (
        <SignalMeshCommandConsole
          signal={selected}
          command={selectedCommand}
          intents={intents}
          events={filteredSnapshots.map((snapshot) => snapshot.event)}
          onCommand={dispatchCommand}
        />
      )}
    </main>
  );
}
