import {
  asLabNodeId,
  asLabPolicyId,
  asLabRunId,
  type LabPolicyEnvelope,
  type MeshNode,
  type MeshTopology,
} from '@domain/recovery-fusion-lab-core';
import type { FusionLabExecutionRequest } from '@service/recovery-fusion-lab-orchestrator';
import type { FusionLabTopologyNode } from './types';

const namespaceFrom = (tenant: string, workspace: string): string => `${tenant}:${workspace}`;

const topologyRunId = (tenant: string, workspace: string): ReturnType<typeof asLabRunId> =>
  asLabRunId(`${tenant}/${workspace}`);

const policyEnvelope = (tenant: string, workspace: string): LabPolicyEnvelope => ({
  runId: topologyRunId(tenant, workspace),
  policyId: asLabPolicyId(namespaceFrom(tenant, workspace), 'baseline'),
  clauses: [],
  id: `${tenant}/${workspace}:policy`,
  maxConcurrency: 4,
  allowPause: true,
  allowWarnings: true,
  pluginIds: ['plugin:core'],
  phaseGating: {
    capture: true,
    plan: true,
    simulate: false,
    execute: true,
    observe: true,
  },
});

const meshNode = (runId: ReturnType<typeof asLabRunId>, localId: string): MeshNode => ({
  id: asLabNodeId(runId, localId),
  role: 'ingest',
  phase: 'capture',
  active: true,
  weight: 0.9,
});

export const mockLabRequest = (tenant: string, workspace: string): FusionLabExecutionRequest => {
  const runId = topologyRunId(tenant, workspace);

  const nodes: readonly MeshNode[] = [
    meshNode(runId, 'node-a'),
    {
      ...meshNode(runId, 'node-b'),
      role: 'transform',
      phase: 'execute',
      active: true,
      weight: 0.6,
    },
    {
      ...meshNode(runId, 'node-c'),
      role: 'simulate',
      phase: 'simulate',
      active: false,
      weight: 0.4,
    },
  ];

  const topology: MeshTopology = {
    runId,
    phase: 'plan',
    nodes,
    edges: [
      {
        from: asLabNodeId(runId, 'node-a'),
        to: asLabNodeId(runId, 'node-b'),
      },
      {
        from: asLabNodeId(runId, 'node-b'),
        to: asLabNodeId(runId, 'node-c'),
      },
    ],
  };

  return {
    workspaceId: `${tenant}/${workspace}`,
    tenantId: tenant,
    mode: 'realtime',
    maxParallelism: 4,
    traceLevel: 'normal',
    topology,
    forecast: {
      timestamps: ['t1', 't2', 't3'],
      values: [20, 30, 15],
    },
    policies: [policyEnvelope(tenant, workspace)],
    context: {
      tenant,
      workspace,
      requestedBy: 'ui-shell',
    },
    pluginNames: ['fusion-lab-plugin:default'],
  };
};

export const mockTopology: readonly FusionLabTopologyNode[] = [
  {
    id: 'tenant-a/node-a',
    name: 'Signal Capture',
    active: true,
    score: 0.88,
  },
  {
    id: 'tenant-a/node-b',
    name: 'Policy Synthesis',
    active: true,
    score: 0.77,
  },
  {
    id: 'tenant-a/node-c',
    name: 'Execution Mesh',
    active: false,
    score: 0.42,
  },
];
