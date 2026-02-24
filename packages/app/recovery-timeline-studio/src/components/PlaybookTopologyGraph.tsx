import { useMemo } from 'react';

interface StudioTopologyNode {
  readonly id: string;
  readonly name: string;
  readonly phase: 'discover' | 'plan' | 'simulate' | 'execute' | 'verify' | 'finalize';
  readonly tags: readonly string[];
}

interface PlaybookTopologyGraphProps {
  readonly nodes: readonly StudioTopologyNode[];
  readonly selectedNodeId: string | null;
  readonly onSelect: (nodeId: string) => void;
}

const phaseClass = (phase: StudioTopologyNode['phase']): string => {
  if (phase === 'discover') return 'phase-discover';
  if (phase === 'plan') return 'phase-plan';
  if (phase === 'simulate') return 'phase-simulate';
  if (phase === 'execute') return 'phase-execute';
  if (phase === 'verify') return 'phase-verify';
  return 'phase-finalize';
};

const nodeTitle = (node: StudioTopologyNode): string => {
  return `${node.name} (${node.phase})`;
};

const summarizeTags = (tags: readonly string[]): string => {
  if (tags.length === 0) return 'tags: none';
  const unique = [...new Set(tags)].toSorted();
  return `tags: ${unique.join(', ')}`;
};

export function PlaybookTopologyGraph({ nodes, selectedNodeId, onSelect }: PlaybookTopologyGraphProps) {
  const grouped = useMemo(() => {
    const stages = new Map<StudioTopologyNode['phase'], StudioTopologyNode[]>();
    for (const node of nodes) {
      const byPhase = stages.get(node.phase) ?? [];
      stages.set(node.phase, [...byPhase, node]);
    }
    return [...stages.entries()].map(([phase, items]) => [
      phase,
      items.toSorted((left, right) => left.name.localeCompare(right.name)),
    ] as const);
  }, [nodes]);

  return (
    <section>
      <h3>Playbook Topology</h3>
      <div>
        {grouped.map(([phase, children]) => (
          <article key={phase} className={`phase-group ${phaseClass(phase)}`}>
            <h4>{phase} ({children.length})</h4>
            <ul>
              {children.map((node) => {
                const active = selectedNodeId === node.id;
                return (
                  <li
                    key={node.id}
                    className={`node ${active ? 'selected' : ''} ${phaseClass(node.phase)}`}
                  >
                    <button
                      type="button"
                      onClick={() => onSelect(node.id)}
                    >
                      <div>{nodeTitle(node)}</div>
                      <small>{summarizeTags(node.tags)}</small>
                    </button>
                  </li>
                );
              })}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}
