import { useMemo } from 'react';
import type { BranchNode } from '@domain/recovery-lab-synthetic-orchestration/compiler-branching-lattice';

type RouteTopologyCanvasProps = {
  readonly routes: readonly string[];
  readonly selected: string;
  readonly onSelect: (route: string) => void;
  readonly onTrace: (route: string) => void;
};

type CanvasNode = {
  readonly route: string;
  readonly index: number;
  readonly phase: 'low' | 'medium' | 'high' | 'critical';
};

const phaseFromRoute = (route: string): CanvasNode['phase'] => {
  if (route.includes('critical')) return 'critical';
  if (route.includes('high')) return 'high';
  if (route.includes('medium')) return 'medium';
  return 'low';
};

export const RouteTopologyCanvas = ({
  routes,
  selected,
  onSelect,
  onTrace,
}: RouteTopologyCanvasProps): React.JSX.Element => {
  const nodes = useMemo(() => {
    const rows = routes.map((route, index) => ({
      route,
      index,
      phase: phaseFromRoute(route),
    })) as CanvasNode[];
    return rows.toSorted((a, b) => b.route.length - a.route.length);
  }, [routes]);

  const selectedIndex = nodes.findIndex((node) => node.route === selected);

  return (
    <section style={{ border: '1px solid #94a3b8', borderRadius: 10, padding: 12 }}>
      <h3>Route topology</h3>
      <p>selected index: {selectedIndex >= 0 ? selectedIndex : 'none'}</p>
      <div style={{ display: 'grid', gap: 8 }}>
        {nodes.map((node) => {
          const isActive = node.route === selected;
          return (
            <button
              key={`${node.route}:${node.index}`}
              type="button"
              onClick={() => onSelect(node.route)}
              onDoubleClick={() => onTrace(node.route)}
              style={{
                textAlign: 'left',
                borderRadius: 8,
                border: isActive ? '2px solid #4f46e5' : '1px solid #cbd5e1',
                background:
                  node.phase === 'critical'
                    ? '#fee2e2'
                    : node.phase === 'high'
                      ? '#ffedd5'
                      : node.phase === 'medium'
                        ? '#fef9c3'
                        : '#ecfeff',
                padding: 8,
              }}
            >
              <strong>{node.index}</strong> {node.route}
            </button>
          );
        })}
      </div>
    </section>
  );
};

export const routePalette = (items: readonly string[]): BranchNode[] =>
  items
    .map((entry, index) => ({
      id: entry,
      kind: 'if' as const,
      weight: index,
      children: [],
    }))
    .filter((entry) => entry.id.length > 0);
