import {
  type CommandId,
  type CommandDependencyEdge,
  type CommandShape,
  type WorkspaceBlueprint,
  type WorkspaceId,
} from './models';
import { brandValue } from '@shared/command-graph-kernel';

const parseCommandId = (value: string): value is `${'command'}:${string}` => value.startsWith('command:');

export interface ParsedWorkspaceSeed {
  readonly workspaceName: WorkspaceId;
  readonly title: string;
  readonly commands: readonly unknown[];
  readonly edges: readonly unknown[];
  readonly tags: readonly string[];
}

export const parseBlueprint = (value: ParsedWorkspaceSeed): WorkspaceBlueprint => {
  const commandOrder = value.commands
    .filter((candidate): candidate is CommandShape => {
      if (typeof candidate !== 'object' || candidate === null) {
        return false;
      }
      const shape = candidate as { id?: unknown; title?: unknown; severity?: unknown };
      return typeof shape.id === 'string' && parseCommandId(shape.id);
    })
    .map((candidate) => candidate.id as CommandId)
    .toSorted((left, right) => (String(left) < String(right) ? -1 : 1));

  const graph = value.edges
    .filter((edge): edge is { from: string; to: string; label: string } => {
      if (edge === null || typeof edge !== 'object') {
        return false;
      }
      const record = edge as { from?: unknown; to?: unknown; label?: unknown };
      return parseCommandId(String(record.from)) && parseCommandId(String(record.to)) && typeof record.label === 'string';
    })
    .map((edge) => ({
      from: brandValue('command', String(edge.from)) as CommandId,
      to: brandValue('command', String(edge.to)) as CommandId,
      label: (edge.label ?? 'normal::edge') as `${'critical' | 'normal' | 'replay'}::${string}`,
    })) as readonly CommandDependencyEdge[];

  return {
    title: `${value.title}::blueprint`,
    commandOrder,
    graph,
    tags: value.tags,
  };
};

export type WorkspaceSeed = {
  readonly tenant: string;
  readonly namespace: string;
};

export const parseWorkspaceContext = (seed: WorkspaceSeed) => ({
  workspaceId: brandValue('workspace', `${seed.tenant}/${seed.namespace}`) as WorkspaceId,
  sessionId: `session:${seed.tenant}:${seed.namespace}` as const,
});
