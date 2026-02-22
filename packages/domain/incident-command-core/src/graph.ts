import { withBrand } from '@shared/core';
import type { CommandId, ExecutionGraph, PlaybookSimulation, PlaybookId } from './types';

export const graphRoots = (graph: ExecutionGraph): readonly CommandId[] =>
  [...graph.commandIds].filter(
    (id) => ![...graph.adjacency.values()].some((edges) => edges.includes(id)),
  );

export const sortGraphLevels = (graph: ExecutionGraph): readonly CommandId[][] => {
  const nodes = new Set(graph.commandIds);
  const indegree = new Map<CommandId, number>();
  for (const node of nodes) {
    indegree.set(node, 0);
  }
  for (const [from, edges] of graph.adjacency.entries()) {
    if (!nodes.has(from)) {
      continue;
    }
    for (const to of edges) {
      if (nodes.has(to)) {
        indegree.set(to, (indegree.get(to) ?? 0) + 1);
      }
    }
  }

  const batches: CommandId[][] = [];
  let frontier = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([node]) => node);
  while (frontier.length > 0) {
    batches.push(frontier);
    const next: CommandId[] = [];
    for (const node of frontier) {
      for (const edge of graph.adjacency.get(node) ?? []) {
        if (!nodes.has(edge)) {
          continue;
        }
        const value = (indegree.get(edge) ?? 0) - 1;
        indegree.set(edge, value);
        if (value === 0) {
          next.push(edge);
        }
      }
    }
    frontier = [...new Set(next)];
  }
  return batches.map((batch) => [...batch].sort((a, b) => String(a).localeCompare(String(b))));
};

export const commandExecutionOrder = (graph: ExecutionGraph): readonly CommandId[] =>
  sortGraphLevels(graph).flat();

export const toSimulationFrame = (
  graph: ExecutionGraph,
  simulation: PlaybookSimulation,
): ReadonlyArray<{ phase: number; commands: readonly CommandId[] }> =>
  sortGraphLevels(graph).map((batch, index) => ({
    phase: index + 1,
    commands: batch,
  }));

export const detectCycle = (graph: ExecutionGraph): boolean => {
  const order = sortGraphLevels(graph);
  const orderedNodes = order.flat();
  return orderedNodes.length !== graph.commandIds.length;
};

export const buildExecutionGraph = (
  commands: ReadonlyArray<{ id: CommandId; dependsOn: readonly CommandId[] }>,
  runbookId: string,
): ExecutionGraph => {
  const adjacency = new Map<CommandId, readonly CommandId[]>();
  const ids = commands.map((command) => command.id);

  for (const command of commands) {
    adjacency.set(
      command.id,
      command.dependsOn.filter((dep) => ids.includes(dep)),
    );
  }

  return {
    runbookId: withBrand(runbookId, 'PlaybookId') as PlaybookId,
    commandIds: ids,
    adjacency,
  };
};
