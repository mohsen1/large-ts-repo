import { useMemo } from 'react';
import type { StageBoundary } from '@domain/recovery-chaos-lab';
import { createTopology } from '@domain/recovery-chaos-lab';

export interface NodeMetric {
  readonly id: string;
  readonly label: string;
  readonly status: 'active' | 'idle' | 'failed';
}

export interface TopologyEdge {
  readonly from: string;
  readonly to: string;
  readonly weight: number;
}

export interface ChaosTopologyGraphProps<T extends readonly StageBoundary<string, unknown, unknown>[]> {
  readonly stages: T;
  readonly onSelect?: (stage: string) => void;
  readonly selected?: string | null;
}

type Matrix = Map<string, string[]>;

export function ChaosTopologyGraph<T extends readonly StageBoundary<string, unknown, unknown>[]>({
  stages,
  onSelect,
  selected
}: ChaosTopologyGraphProps<T>) {
  const topology = useMemo(() => {
    const edges = createTopology(stages);
    const matrix = edges.reduce<Matrix>((result, edge) => {
      const current = result.get(edge.from) ?? [];
      current.push(edge.to);
      result.set(edge.from, current);
      return result;
    }, new Map());

    const isolated = stages
      .filter((stage) => !matrix.has(stage.name))
      .map((stage) => stage.name);
    for (const id of isolated) {
      matrix.set(id, []);
    }

    return { edges, matrix };
  }, [stages]);

  const nodes = useMemo<NodeMetric[]>(() => {
    return stages.map((stage) => ({
      id: stage.name,
      label: String(stage.name).split(':').at(-1) ?? stage.name,
      status: topology.matrix.has(stage.name) && topology.matrix.get(stage.name)?.length
        ? 'active'
        : 'idle'
    }));
  }, [stages, topology.matrix]);

  const summary = useMemo(() => {
    const weighted = topology.edges.reduce((acc, edge) => acc + edge.weight, 0);
    const maxWeight = topology.edges.length ? Math.max(...topology.edges.map((edge) => edge.weight)) : 0;
    const status = weighted > 0.5 ? 'active' : topology.edges.length ? 'idle' : 'failed';
    return {
      nodes: nodes.length,
      edges: topology.edges.length,
      weighted,
      maxWeight,
      status
    };
  }, [nodes.length, topology.edges]);

  return (
    <section className="chaos-topology">
      <header>
        <h3>Topology</h3>
        <p>
          {summary.nodes} nodes, {summary.edges} edges, activity: {summary.status}
        </p>
      </header>
      <div className="topology-metrics">
        <span>Weighted: {summary.weighted.toFixed(2)}</span>
        <span>Peak edge: {summary.maxWeight.toFixed(2)}</span>
      </div>
      <ul className="topology-grid">
        {nodes.map((node) => {
          const children = topology.matrix.get(node.id) ?? [];
          return (
            <li key={node.id} className={`node state-${node.status}`}>
              <button
                type="button"
                onClick={() => onSelect?.(node.id)}
                className={selected === node.id ? 'selected' : ''}
              >
                <strong>{node.label}</strong>
                <small>{node.id}</small>
              </button>
              {children.length > 0 ? (
                <ul>
                  {children.map((target) => (
                    <li key={`${node.id}->${target}`}>{target}</li>
                  ))}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function renderTopologyLegend() {
  return (
    <aside className="topology-legend">
      <dl>
        <dt>active</dt>
        <dd>Has at least one outgoing transition</dd>
        <dt>idle</dt>
        <dd>No outgoing transitions</dd>
        <dt>failed</dt>
        <dd>No edges in topology</dd>
      </dl>
    </aside>
  );
}
