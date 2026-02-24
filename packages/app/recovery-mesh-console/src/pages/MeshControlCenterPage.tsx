import { useState } from 'react';
import { MeshRuntimeInspector } from '../components/MeshRuntimeInspector';
import { MeshRunOrchestrator } from '../components/MeshRunOrchestrator';
import { MeshSignalPalette } from '../components/MeshSignalPalette';
import { useMeshSignalStream } from '../hooks/useMeshSignalStream';
import { describeTopology } from '../services/meshTopologyService';

const initialTabs = ['orchestrate', 'inspect', 'palette'] as const;

type MeshControlTab = (typeof initialTabs)[number];

export const MeshControlCenterPage = () => {
  const stream = useMeshSignalStream();
  const [tab, setTab] = useState<MeshControlTab>('orchestrate');
  const stats = describeTopology(stream.topology);
  const title = `Control Center: ${stats.signature}`;

  return (
    <main>
      <header>
        <h2>{title}</h2>
        <p>Topology nodes: {stats.nodes}</p>
      </header>

      <nav>
        {initialTabs.map((entry) => (
          <button
            key={entry}
            type="button"
            data-active={entry === tab}
            onClick={() => setTab(entry)}
          >
            {entry}
          </button>
        ))}
      </nav>

      <section>
        {tab === 'palette' && (
          <MeshSignalPalette
            selected={stream.selected}
            onSelect={stream.select}
            mode={stream.catalog?.mode ?? 'single'}
            items={stream.catalog?.items ?? []}
            running={false}
          />
        )}

        {tab === 'orchestrate' && <MeshRunOrchestrator />}
        {tab === 'inspect' && <MeshRuntimeInspector />}
      </section>

      <section>
        <h4>Stream stats</h4>
        <p>Catalog ready: {stream.catalog ? 'yes' : 'loading'}</p>
        <p>Signal events: {stream.events.length}</p>
        <p>Topology nodes: {stream.topology.nodes.length}</p>
      </section>
    </main>
  );
};
