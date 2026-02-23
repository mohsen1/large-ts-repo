import { Contract, EntityModel, Field, entityByName } from '@domain/contracts';
import { PolicyArtifact, PolicyContextSpec, PolicyGraph, PolicyNode } from './models';

export interface ContractAdapterInput {
  contract: Contract;
  principal: string;
  resource: string;
}

export interface ArtifactFromContract {
  artifact: PolicyArtifact;
  nodes: readonly PolicyNode[];
  graph: PolicyGraph;
}

const mapSeverity = (fields: readonly Field[]): 'critical' | 'high' | 'medium' | 'low' => {
  if (fields.some((field) => field.name === 'criticality' && field.type === 'critical')) {
    return 'critical';
  }
  if (fields.some((field) => field.name === 'impact')) {
    return 'high';
  }
  if (fields.some((field) => field.name === 'tier')) {
    return 'medium';
  }
  return 'low';
};

const entityId = (entity: EntityModel): string =>
  entity.name.toLowerCase().replace(/\s+/g, '-');

const toArtifact = (service: string, entity: EntityModel, request: ContractAdapterInput): PolicyArtifact => {
  const now = new Date().toISOString();
  return {
    id: `${service}:${entityId(entity)}` as PolicyArtifact['id'],
    name: `${service}/${entity.name}`,
    description: `${service} policy artifact for ${entity.name}`,
    owner: request.principal,
    target: {
      region: 'global',
      service,
      environment: 'prod',
      tags: ['contract-adapter', entity.name.toLowerCase()],
    },
    expression: `principal == "${request.principal}" & resource == "${request.resource}"`,
    severity: mapSeverity(entity.fields),
    state: 'draft',
    mode: 'canary',
    priority: 'P2',
    windows: [],
    version: 1,
    revision: `${entity.name}:v1`,
    contract: request.contract,
    createdAt: now,
    updatedAt: now,
  };
};

const makeNode = (artifact: PolicyArtifact): PolicyNode => ({
  id: `${artifact.id}:node` as PolicyNode['id'],
  artifact,
  dependsOn: [],
  retries: 3,
  timeoutSeconds: 30,
  requiresHumanApproval: false,
  ownerTeam: artifact.owner,
  slaWindowMinutes: 15,
});

export const adaptContractToPolicyArtifacts = (input: ContractAdapterInput): ArtifactFromContract => {
  const entities = input.contract.entities;
  const nodes = entities
    .map((entity) => toArtifact(input.contract.service, entity, input))
    .map(makeNode);

  const edges = nodes
    .map((node, index) => {
      if (index === 0) return null;
      return {
        from: nodes[index - 1].id,
        to: node.id,
      };
    })
    .filter(Boolean) as Array<{ from: PolicyNode['id']; to: PolicyNode['id'] }>;

  return {
    artifact: nodes[0].artifact,
    nodes,
    graph: {
      nodes,
      edges,
    },
  };
};

export const buildContextFromRequest = (input: ContractAdapterInput): PolicyContextSpec => ({
  principal: input.principal,
  resource: input.resource,
  action: 'read',
  attributes: {
    service: input.contract.service,
    entityCount: input.contract.entities.length,
    artifact: adaptContractToPolicyArtifacts(input).artifact.name,
  },
  now: new Date().toISOString(),
});
