import type {
  OrchestratorRequest,
  OrchestratorResult,
  PlaybookStudioFacadeRuntime,
} from '@service/recovery-ops-playbook-studio-orchestrator';
import { createFacade } from '@service/recovery-ops-playbook-studio-orchestrator';
import {
  defaultCatalogManifest,
  type PlaybookCatalogManifest,
  type PluginState,
  type RunId,
} from '@domain/recovery-ops-playbook-studio';

export type StudioScope = {
  tenantId: string;
  workspaceId: string;
  tags?: readonly string[];
};

export interface StudioRunPayload {
  readonly scope: StudioScope;
  readonly operator: string;
  readonly input: Record<string, unknown>;
}

export interface StudioRunSnapshot {
  readonly runId: string;
  readonly status: 'queued' | 'running' | 'complete' | 'errored';
  readonly diagnostics: readonly string[];
  readonly traceCount: number;
}

const DEFAULT_STAGES: readonly PluginState[] = ['discover', 'plan', 'simulate', 'execute', 'verify', 'finalize'];
const FACADES = new Map<string, PlaybookStudioFacadeRuntime>();

const scopeKey = (scope: StudioScope): string => `${scope.tenantId}::${scope.workspaceId}`;
const buildFacade = (scope: StudioScope): PlaybookStudioFacadeRuntime => {
  const key = scopeKey(scope);
  const current = FACADES.get(key);
  if (current) return current;

  const built = createFacade({
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    selectedStages: DEFAULT_STAGES,
    options: {
      concurrency: 4,
      retryLimit: 2,
      heartbeatMs: 250,
      autoPersist: true,
    },
  });
  FACADES.set(key, built);
  return built;
};

const facadeCatalog = (catalog?: PlaybookCatalogManifest): PlaybookCatalogManifest => {
  if (!catalog) return defaultCatalogManifest;
  if (!catalog.entries.length) return defaultCatalogManifest;
  return catalog;
};

const toSnapshot = (result: OrchestratorResult): StudioRunSnapshot => ({
  runId: result.runId,
  status: result.status,
  diagnostics: result.diagnostics,
  traceCount: result.trace.totals.elapsedMs,
});

export const startStudioRun = async (
  payload: StudioRunPayload,
): Promise<{ snapshot?: StudioRunSnapshot; error?: string }> => {
  const createdFacade = buildFacade(payload.scope);
  const request: OrchestratorRequest = {
    tenantId: payload.scope.tenantId,
    workspaceId: payload.scope.workspaceId,
    selectedStages: [...DEFAULT_STAGES],
    context: {
      region: 'global',
      correlationId: `${payload.scope.tenantId}:${Date.now()}`,
      operator: payload.operator,
    },
    input: {
      ...payload.input,
      tags: payload.scope.tags ?? [],
      startedBy: payload.operator,
      catalogVersion: facadeCatalog().tenantId,
      catalogEntries: facadeCatalog().entries.length,
    },
    plugins: [],
  };

  const result = await createdFacade.prepareAndRun({
    tenantId: payload.scope.tenantId,
    workspaceId: payload.scope.workspaceId,
    operator: payload.operator,
    input: request.input,
  });
  if (!result.ok) {
    return { error: result.error };
  }
  return { snapshot: toSnapshot(result.value) };
};

export const listStudioRunIds = async (tenantId: string): Promise<{ runIds: readonly string[]; error?: string }> => {
  const current = buildFacade({ tenantId, workspaceId: `${tenantId}-workspace` });
  const result = await current.listRunIds(tenantId);
  if (!result.ok) {
    return { runIds: [], error: result.error };
  }
  return { runIds: result.value };
};

export const inspectStudioRun = async (runId: string): Promise<{ diagnostics: readonly string[]; error?: string }> => {
  const [tenantId, workspaceId, ...runParts] = runId.split('::');
  const resolvedRunId = runParts.length ? `${tenantId}::${workspaceId}::${runParts.join('::')}` : '';
  if (!tenantId || !workspaceId || !resolvedRunId) {
    return { diagnostics: [], error: 'invalid-run-id' };
  }
  const current = buildFacade({
    tenantId: tenantId || 'tenant-default',
    workspaceId: workspaceId || 'workspace-default',
  });
  const result = await current.diagnostics(resolvedRunId as RunId);
  if (!result.ok) return { diagnostics: [], error: result.error };
  return { diagnostics: result.value };
};

export const getCatalogStats = (): { entries: number; hasEntries: boolean } => {
  const catalog = facadeCatalog();
  const entries = catalog.entries.length;
  return {
    entries,
    hasEntries: entries > 0,
  };
};

export const ensureMemoryStore = (): void => {
  FACADES.set('tenant-default::workspace-default', buildFacade({ tenantId: 'tenant-default', workspaceId: 'workspace-default' }));
};
