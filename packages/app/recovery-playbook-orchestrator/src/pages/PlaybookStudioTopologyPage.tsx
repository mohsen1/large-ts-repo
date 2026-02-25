import { useState, useMemo } from 'react';
import { usePlaybookTopologyFlow } from '../hooks/usePlaybookTopologyFlow';
import { PlaybookStudioTopology } from '../components/playbook-studio/PlaybookStudioTopology';

export interface PlaybookStudioTopologyPageProps {
  seed: string;
}

export const PlaybookStudioTopologyPage = ({ seed }: PlaybookStudioTopologyPageProps) => {
  const report = usePlaybookTopologyFlow(seed);
  const [selected, setSelected] = useState(report.nodes[0]?.id ?? '');

  const path = useMemo(() => {
    const item = report.nodes.find((node) => node.id === selected);
    if (!item) return [];
    return [item.label, ...item.connections];
  }, [report.nodes, selected]);

  return (
    <main className="playbook-studio-topology-page">
      <h1>Playbook Studio Topology</h1>
      <section>
        <h2>Topology report</h2>
        <p>Seed: {seed}</p>
        <p>Nodes: {report.nodes.length}</p>
      </section>
      <PlaybookStudioTopology
        nodes={report.nodes}
        selected={selected}
        onNodeClick={setSelected}
      />
      <section>
        <h3>Selected path</h3>
        <p>{path.join(' → ') || 'none'}</p>
      </section>
      <section>
        <h3>Path list</h3>
        <ul>
          {report.paths.map((pathValue) => (
            <li key={`${pathValue[0]}-${pathValue[1]}`}>
              {pathValue.join(' :: ')}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};
