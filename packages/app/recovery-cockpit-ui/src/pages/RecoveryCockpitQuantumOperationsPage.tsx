import { FC, useMemo, useState } from 'react';
import { useQuantumStudio } from '../hooks/useQuantumStudio';
import { QuantumCommandDeck } from '../components/quantum/QuantumCommandDeck';
import { QuantumRunPanel } from '../components/quantum/QuantumRunPanel';
import { QuantumTopologyBoard } from '../components/quantum/QuantumTopologyBoard';
import {
  type QuantumProfile,
  scenarioId,
  tenantId,
  normalizeProfile,
  nodeId,
  signalId,
  namespaceId,
} from '@shared/quantum-studio-core';

const defaultProfile = normalizeProfile({
  namespace: namespaceId('recovery'),
  tenant: tenantId('tenant-a'),
  scenarioId: scenarioId('recovery-quantum'),
  scenarioName: 'Recovery Quantum Operations',
  graph: {
    nodes: [
      { id: nodeId('ingest'), route: '/ingest', role: 'source' },
      { id: nodeId('transform'), route: '/transform', role: 'processor' },
      { id: nodeId('sink'), route: '/sink', role: 'sink' },
    ],
    edges: [
      { from: nodeId('ingest'), to: nodeId('transform'), latencyMs: 8 },
      { from: nodeId('transform'), to: nodeId('sink'), latencyMs: 14 },
    ],
  },
  metadata: {
    createdBy: 'page',
  },
  seedSignals: [
    { signalId: signalId('sig:a'), tier: 1, weight: 0.33 },
    { signalId: signalId('sig:b'), tier: 2, weight: 0.42 },
    { signalId: signalId('sig:c'), tier: 3, weight: 0.25 },
  ],
}) satisfies QuantumProfile;

export const RecoveryCockpitQuantumOperationsPage: FC = () => {
  const [selectedSignalMode, setSelectedSignalMode] = useState<'discovery' | 'control' | 'synthesis'>('discovery');

  const profile: QuantumProfile = useMemo(() => defaultProfile, []);

  const seed = useMemo(
    () => ({
      tenant: tenantId('tenant-a'),
      scenarioId: scenarioId('recovery-quantum'),
      profile,
      selectedPlugins: ['plugin:recovery/source', 'plugin:recovery/transform'],
      requestedMode: selectedSignalMode,
    }),
    [profile, selectedSignalMode],
  );

  const { runs, isLoading, error } = useQuantumStudio(seed);
  const [selected, setSelected] = useState('');

  return (
    <main style={{ padding: 24, display: 'grid', gap: 14 }}>
      <header>
        <h1>Quantum Operations Studio</h1>
        <p>Runtime-aware planning workspace with plugin-level orchestration diagnostics.</p>
      </header>

      <section style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setSelectedSignalMode('discovery')}>
          Discovery
        </button>
        <button type="button" onClick={() => setSelectedSignalMode('control')}>
          Control
        </button>
        <button type="button" onClick={() => setSelectedSignalMode('synthesis')}>
          Synthesis
        </button>
        <span style={{ marginLeft: 12 }}>{isLoading ? 'running' : 'ready'}</span>
      </section>

      <QuantumTopologyBoard nodes={profile.graph.nodes} edges={profile.graph.edges} />

      <QuantumRunPanel seed={seed} signalMode={selectedSignalMode} />

      <QuantumCommandDeck
        runs={runs}
        selectedId={selected}
        onReplay={(runId) => {
          setSelected(runId);
        }}
      />

      {error ? <p style={{ color: '#b91c1c' }}>{error}</p> : null}
    </main>
  );
};
