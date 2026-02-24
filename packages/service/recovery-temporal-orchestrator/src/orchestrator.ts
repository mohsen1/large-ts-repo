import { executeBatch, executeOrchestration, type RuntimeExecution, type RuntimeOrchestrationOptions } from './runtime';
import { createScopedStore, createMemoryStore } from '@data/recovery-temporal-store';
import { asRunId, isoNow } from '@shared/temporal-ops-runtime';
import type { TemporalStore } from '@data/recovery-temporal-store';
import type { Brand } from '@shared/temporal-ops-runtime';

export interface OrchestratorApi {
  readonly run: (options: RuntimeOrchestrationOptions) => Promise<RuntimeExecution>;
  readonly runBatch: (requests: readonly RuntimeOrchestrationOptions[]) => Promise<readonly RuntimeExecution[]>;
  readonly ping: () => Promise<'ok'>;
  readonly diagnostics: (tenant: string) => Promise<{ readonly runCount: number; readonly hasData: boolean }>;
}

export const createOrchestrator = (): OrchestratorApi => {
  const store = createMemoryStore('global');
  const scoped: Record<string, TemporalStore> = {};

  return {
    async run(options: RuntimeOrchestrationOptions): Promise<RuntimeExecution> {
      const output = await executeOrchestration(options);
      return output;
    },
    async runBatch(requests: readonly RuntimeOrchestrationOptions[]): Promise<readonly RuntimeExecution[]> {
      return executeBatch(requests);
    },
    async ping(): Promise<'ok'> {
      return 'ok';
    },
    async diagnostics(tenant: string): Promise<{ readonly runCount: number; readonly hasData: boolean }> {
      const tenantStore = scoped[tenant] ?? createScopedStore(tenant);
      scoped[tenant] = tenantStore;
      const runs = tenantStore.list();
      const hasData = runs.length > 0;
      return {
        runCount: runs.length,
        hasData,
      };
    },
  };
};

export const bootstrapOrchestrator = (): OrchestratorApi => createOrchestrator();

export const diagnosticsFixture = async (): Promise<{ readonly sampleRunId: string }> => {
  const orchestrator = createOrchestrator();
  const tenant = 'tenant-fixture' as Brand<string, 'TenantId'>;
  await orchestrator.run({
    tenant,
    actor: 'system',
    candidateNames: ['alpha', 'beta'],
    planName: 'fixture-plan',
  });

  const { runCount, hasData } = await orchestrator.diagnostics(String(tenant));
  const marker = asRunId(String(tenant), `run-${runCount}-${String(hasData)}`);
  const store = createScopedStore(String(tenant));
  store.insert({
    runId: marker,
    name: 'fixture',
    tenant,
    scope: 'scope:fixture',
    nodes: [],
    edges: [],
    createdAt: isoNow(),
    updatedAt: isoNow(),
    metadata: {},
  });

  return {
    sampleRunId: String(marker),
  };
};
