import { useEffect, useMemo, useState } from 'react';
import { createStudioPipeline, useStudioPipelineProfile, type StageKindSpec } from '../studio/pipeline';
import { stageKinds } from '@domain/recovery-playbook-studio-core';
import { StudioHttpAdapter } from '../studio/adapters/http';

export interface TopologyNode {
  readonly id: string;
  readonly label: string;
  readonly connections: readonly string[];
}

export interface TopologyReport {
  readonly nodes: readonly TopologyNode[];
  readonly paths: readonly string[][];
  readonly stageCount: number;
}

const seedNodes = (seed: string): readonly TopologyNode[] =>
  stageKinds.map((stage, index) => ({
    id: `${seed}:${stage}`,
    label: stage,
    connections: index === stageKinds.length - 1
      ? []
      : [`${seed}:${stageKinds[index + 1]}`],
  }));

export const usePlaybookTopologyFlow = (seed: string) => {
  const [nodes, setNodes] = useState<readonly TopologyNode[]>(seedNodes(seed));
  const [paths, setPaths] = useState<readonly string[][]>([]);

  useEffect(() => {
    void (async () => {
      const adapter = new StudioHttpAdapter({
        baseUrl: '/api',
        tenantId: 'tenant-default',
        workspaceId: 'workspace-default',
        headers: {
          accept: 'application/json',
        },
      });

      const stages: readonly StageKindSpec<string, string>[] = stageKinds.map((stage) => ({
        name: stage,
        run: async (value) => `${value}:${stage}`,
      }));
      const profile = useStudioPipelineProfile(seed, stages);
      await adapter.get<{ topology: string[][] }>(`/topology/${seed}`);
      setPaths(profile.stages.map((stage) => [stage, `${seed}:${stage}`]));
      setNodes(seedNodes(seed));
      await adapter[Symbol.asyncDispose]();
    })();
  }, [seed]);

  const report = useMemo<TopologyReport>(
    () => ({
      nodes,
      paths,
      stageCount: nodes.length,
    }),
    [nodes, paths],
  );

  return report;
};
