import { type RuntimeTopology, type RuntimeEdge, type GraphNode } from '@shared/recovery-orchestration-lab-runtime';

export interface CatalogEntry {
  readonly label: string;
  readonly active: boolean;
  readonly version: string;
}

export interface WorkspaceGraph {
  readonly topology: RuntimeTopology;
  readonly entries: readonly CatalogEntry[];
  readonly active: number;
}

export const createWorkspaceTopology = (labels: readonly string[]): WorkspaceGraph => {
  const nodes: readonly GraphNode<string>[] = labels.map((label, index) => ({
    id: label as never,
    weight: 1 + index,
    tags: ['catalog'],
  }));

  const edges: readonly RuntimeEdge<string>[] = labels
    .slice(0, -1)
    .map((from, index) => ({
      from: from as never,
      to: labels[index + 1] as never,
      latencyMs: 25 + index,
    }));

  const entries: readonly CatalogEntry[] = labels.map((label) => ({
    label,
    active: label.length > 0,
    version: '1.0.0',
  }));

  return {
    topology: { nodes, edges },
    entries,
    active: entries.filter((entry) => entry.active).length,
  };
};

export const catalogReport = (graph: WorkspaceGraph): string =>
  graph.entries
    .map((entry, index) => `${index}:${entry.label}:${entry.version}`)
    .join('|');

export const isCatalogActive = (graph: WorkspaceGraph): boolean => graph.active > 0;
