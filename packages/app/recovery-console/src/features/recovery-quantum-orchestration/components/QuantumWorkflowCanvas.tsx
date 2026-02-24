import { useMemo } from 'react';
import type { WorkflowGraph, WorkflowNode, WorkflowPhase } from '@shared/orchestration-kernel';

interface QuantumWorkflowCanvasProps {
  readonly graph: WorkflowGraph;
  readonly selectedNodeId?: string;
  readonly onSelectNode?: (nodeId: string) => void;
}

interface CanvasSlot {
  readonly index: number;
  readonly nodeId: string;
  readonly label: string;
  readonly phase: WorkflowPhase;
  readonly tags: string;
}

const nodeFingerprint = (node: WorkflowNode) => `${node.id}:${node.phase}:${node.kind}`;

const toSlot = (node: WorkflowNode, index: number): CanvasSlot => ({
  index,
  nodeId: String(node.id),
  label: node.label,
  phase: node.phase,
  tags: node.tags.join(','),
});

const renderEdges = (graph: WorkflowGraph, slots: readonly CanvasSlot[]): string => {
  const lines: string[] = [];
  const routeMap = graph.toPathMap();
  const slotById = new Map<string, CanvasSlot>();
  for (const slot of slots) {
    slotById.set(slot.nodeId, slot);
  }

  for (const [source, route] of Object.entries(routeMap)) {
    lines.push(`${source} -> ${route}`);
  }
  for (const id of slotById.keys()) {
    if (!(id in routeMap)) {
      lines.push(`${id} -> end`);
    }
  }
  return lines.length === 0 ? 'no routes configured' : lines.join(' | ');
};

export const QuantumWorkflowCanvas = ({ graph, selectedNodeId, onSelectNode }: QuantumWorkflowCanvasProps) => {
  const orderedNodes = useMemo(() => graph.topologicalOrder(), [graph]);
  const slots = useMemo(
    () =>
      orderedNodes.map((nodeId, index) => {
        const node = graph.get(nodeId);
        if (!node) {
          throw new Error(`missing node for graph id ${nodeId}`);
        }
        return toSlot(node, index);
      }),
    [orderedNodes, graph],
  );
  const edgeOverview = useMemo(() => renderEdges(graph, slots), [slots, graph]);

  return (
    <section>
      <h3>Quantum workflow topology</h3>
      <div style={{ marginBottom: 8 }}>{`edges: ${edgeOverview}`}</div>
      <ol>
        {slots.map((slot) => (
          <li key={slot.nodeId}>
            <button
              type="button"
              style={{ border: slot.nodeId === selectedNodeId ? '2px solid #007' : '1px solid #ddd', marginBottom: 4 }}
              onClick={() => {
                onSelectNode?.(slot.nodeId);
              }}
            >
              {`${slot.index} · ${slot.nodeId}:${slot.phase} [${slot.phase}] tags=${slot.tags} ${slot.label}`}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
};
