import { parseRuntimeId } from '@shared/recovery-orchestration-lab-runtime';
import {
  type PlanRequest,
  type PlanResult,
  createPlanForWorkspace,
} from '@domain/recovery-orchestration-lab-models';
import type { WorkspaceToken } from '@domain/recovery-orchestration-lab-models';

export interface CatalogItem {
  readonly tenant: string;
  readonly workspaceId: string;
  readonly scenarioId: string;
  readonly commands: readonly string[];
  readonly isActive: boolean;
}

const fallbackWorkspace = parseRuntimeId('ws', 'ws:global:default') as unknown as WorkspaceToken;

const defaultCatalog = [
  {
    tenant: 'tenant:global',
    workspaceId: 'ws:tenant:global:default',
    scenarioId: 'scenario:tenant:global:baseline',
    commands: ['assess', 'simulate', 'remediate', 'verify'],
    isActive: true,
  },
  {
    tenant: 'tenant:ops',
    workspaceId: 'ws:tenant:ops:edge',
    scenarioId: 'scenario:tenant:ops:edge-latency',
    commands: ['detect', 'triage', 'runbook', 'close'],
    isActive: true,
  },
];

export const listCatalog = (): readonly CatalogItem[] => defaultCatalog;

export const getCatalogItem = (tenant: string): CatalogItem | undefined =>
  defaultCatalog.find((item) => item.tenant === tenant);

export const buildPlan = async (request: PlanRequest): Promise<PlanResult> =>
  createPlanForWorkspace(request);

export const previewPlan = (tenant: string): Promise<PlanRequest> => {
  const item = getCatalogItem(tenant) ?? {
    tenant,
    workspaceId: `ws:${tenant}:fallback`,
    scenarioId: `scenario:${tenant}:default`,
    commands: ['assess'],
    isActive: true,
  };
  return Promise.resolve({
    tenant,
    workspace: item.workspaceId,
    scenario: item.scenarioId,
    commands: [...item.commands],
  });
};

export const loadCatalog = async (): Promise<readonly CatalogItem[]> => {
  return listCatalog().map((entry) => ({
    ...entry,
    workspaceId: String(entry.workspaceId),
    scenarioId: String(entry.scenarioId),
  }));
};

export const resolveWorkspace = (tenant: string): WorkspaceToken => {
  const matched = defaultCatalog.find((entry) => entry.tenant === tenant)?.workspaceId;
  if (!matched) {
    return fallbackWorkspace;
  }
  return parseRuntimeId('ws', matched) as unknown as WorkspaceToken;
};
