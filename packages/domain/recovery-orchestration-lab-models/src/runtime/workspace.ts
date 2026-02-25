import { type UnionToIntersection } from '@shared/type-level';
import { createWorkspaceTopology, type WorkspaceGraph } from '../adapters/catalog.js';
import { createScenarioBlueprint, type StageCatalog } from '../types/laboratory.js';
import type { StageToken } from '../types/brands.js';
import { parseRuntimeId, type RunId, runtimeId } from '@shared/recovery-orchestration-lab-runtime';

export interface WorkspaceConfiguration {
  readonly tenant: string;
  readonly region: string;
  readonly policyVersion: string;
}

export interface WorkspaceLayout {
  readonly id: string;
  readonly tenant: string;
  readonly labels: readonly string[];
}

export type WorkspaceTag = `workspace:${string}`;

export const workspaceTag = (tenant: string): WorkspaceTag => `workspace:${tenant}`;

export interface WorkspaceSnapshot {
  readonly id: string;
  readonly config: WorkspaceConfiguration;
  readonly blueprintCount: number;
  readonly runIds: readonly RunId[];
}

export type WorkspaceBuilder<TLayout extends WorkspaceLayout> = {
  readonly layout: TLayout;
  readonly makeLayout: () => TLayout;
  readonly describe: () => string;
};

export interface WorkspaceRuntime {
  readonly id: string;
  readonly config: WorkspaceConfiguration;
  readonly runGraph: WorkspaceGraph;
  readonly buildBlueprint: (tenant: string, scenarioId: string) => ReturnType<typeof createScenarioBlueprint>;
}

export const createWorkspaceRuntime = (
  workspace: WorkspaceLayout,
  config: WorkspaceConfiguration,
): WorkspaceRuntime => {
  const runGraph = createWorkspaceTopology(workspace.labels);
  const runIds = workspace.labels
    .map((label) => runtimeId.run(workspace.id, label))
    .map((entry) => parseRuntimeId('run', entry));
  const _blueprintSeed = runIds[0] ?? runtimeId.run(workspace.id, workspace.tenant);

  return {
    id: workspace.id,
    config,
    runGraph,
    buildBlueprint: (tenant, scenarioId) => {
      const stages: StageCatalog = {
        [`stage:intake` as StageToken]: [],
      };
      return createScenarioBlueprint(
        `scenario:${tenant}:${scenarioId}` as never,
        `ws:${tenant}:${scenarioId}` as never,
        stages,
        [],
        {
          id: `policy:${scenarioId}:v1` as never,
          version: '1.0.0',
          parameters: { tenant },
        },
      );
    },
  };
};

export const summarizeWorkspace = <TWorkspace extends WorkspaceLayout>(workspace: TWorkspace): string => {
  return `${workspace.id}::${workspace.tenant}::${workspace.labels.length}`;
};

export const mergeWorkspaceSignatures = (...signatures: readonly string[]): string =>
  signatures.map((signature) => signature.trim()).filter(Boolean).sort().join('::');

export const mergeAny = <T extends readonly Record<string, unknown>[]>(...values: T): UnionToIntersection<T[number]> =>
  Object.assign({}, ...values) as UnionToIntersection<T[number]>;
