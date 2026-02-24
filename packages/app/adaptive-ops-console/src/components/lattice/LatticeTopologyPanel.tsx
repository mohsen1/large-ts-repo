import { useMemo, type ReactElement } from 'react';
import type { LatticeBlueprintManifest } from '@domain/recovery-lattice';

type Props = {
  readonly blueprint: LatticeBlueprintManifest;
  readonly compact?: boolean;
  readonly onHoverNode?: (node: string) => void;
  readonly hoveredNode?: string | null;
};

const getNodes = (blueprint: LatticeBlueprintManifest): readonly string[] =>
  blueprint.steps.map((step) => `${step.kind}:${step.target}`);

const getLinks = (steps: readonly string[]): readonly [string, string][] => {
  const links: Array<[string, string]> = [];
  for (let index = 0; index < steps.length - 1; index += 1) {
    links.push([steps[index], steps[index + 1]]);
  }
  return links;
};

export const LatticeTopologyPanel = ({
  blueprint,
  compact,
  onHoverNode,
  hoveredNode,
}: Props): ReactElement => {
  const nodes = useMemo(() => getNodes(blueprint), [blueprint]);
  const links = useMemo(() => getLinks(nodes), [nodes]);

  return (
    <section className={`lattice-topology ${compact ? 'compact' : ''}`}>
      <header>
        <h3>{blueprint.name}</h3>
        <p>{blueprint.route}</p>
      </header>
      <div className="lattice-graph">
        {nodes.map((node) => {
          const isActive = hoveredNode === node;
          return (
            <button
              key={node}
              className={`node ${isActive ? 'active' : ''}`}
              type="button"
              onMouseEnter={() => onHoverNode?.(node)}
              onMouseLeave={() => onHoverNode?.('')}
            >
              {node}
            </button>
          );
        })}
        <ul>
          {links.map(([from, to], index) => (
            <li key={`${from}-${to}-${index}`}>
              {from} ➜ {to}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
};
