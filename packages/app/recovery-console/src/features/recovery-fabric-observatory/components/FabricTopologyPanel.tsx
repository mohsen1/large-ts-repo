import { memo } from 'react';
import type { FabricTopology, FabricNode } from '@domain/recovery-ops-fabric';

export interface FabricTopologyPanelProps {
  topology: FabricTopology | null;
  selectedFacility?: string;
  onSelectFacility?: (facilityId: string) => void;
}

const NodeRow = memo(({ node, highlighted, onSelect }: {
  node: FabricNode;
  highlighted: boolean;
  onSelect: (facilityId: string) => void;
}) => {
  return (
    <li
      onClick={() => onSelect(node.facilityId)}
      style={{
        border: highlighted ? '1px solid #3f51b5' : '1px solid #cfd8dc',
        marginBottom: 8,
        padding: 8,
        cursor: 'pointer',
      }}
    >
      <div>
        {node.id} ({node.role})
      </div>
      <div>facility={node.facilityId}</div>
      <div>health={node.health} cpu={node.cpu} mem={node.mem}</div>
    </li>
  );
});

export const FabricTopologyPanel = ({
  topology,
  selectedFacility,
  onSelectFacility,
}: FabricTopologyPanelProps) => {
  if (!topology) {
    return (
      <section>
        <h3>Fabric Topology</h3>
        <p>Topology is not loaded</p>
      </section>
    );
  }

  const handleSelect = onSelectFacility ?? (() => {});
  return (
    <section>
      <h3>Fabric Topology</h3>
      <div>tenant {topology.tenantId}</div>
      <div>nodes {topology.nodes.length}</div>
      <ol>
        {topology.nodes.map((node) => {
          const highlighted = node.facilityId === selectedFacility;
          return <NodeRow key={node.id} node={node} highlighted={highlighted} onSelect={handleSelect} />;
        })}
      </ol>
    </section>
  );
};
