import {
  asNamespace,
  asSession,
  asTenant,
  asWindow,
} from '@domain/recovery-ecosystem-analytics';
import { createInMemorySignalAdapter } from './adapters';
import { createScenarioEngine } from './engine';
import type { Result } from '@shared/result';
import type { JsonValue } from '@shared/type-level';
import type {
  OrchestratorDependencies,
  OrchestratorFacade,
  OrchestratorOptions,
  AnalyzeRequest,
  AnalyzeResult,
} from './ports';
import type { AnalyticsStoreSignalEvent } from '@data/recovery-ecosystem-analytics-store';

export const createOrchestratorFacade = async (
  dependencies?: Partial<OrchestratorDependencies>,
  options?: Partial<OrchestratorOptions>,
): Promise<OrchestratorFacade> => {
  const adapter = await createInMemorySignalAdapter();
  const resolvedDeps: OrchestratorDependencies = {
    store: dependencies?.store ?? adapter.store,
  };
  const resolvedOptions: OrchestratorOptions = {
    tenant: options?.tenant ?? asTenant('tenant:default'),
    namespace: options?.namespace ?? asNamespace('namespace:recovery-ecosystem'),
    window: options?.window ?? asWindow('window:recovery-ecosystem'),
  };
  return createScenarioEngine(resolvedDeps, resolvedOptions, adapter.emitter);
};

export const createFacadeWithDefaults = async (
  tenant = 'tenant:runtime' as const,
  namespace = 'namespace:recovery-ecosystem' as const,
): Promise<OrchestratorFacade> => {
  const resolvedTenant = asTenant(tenant.replace(/^tenant:/, ''));
  const resolvedNamespace = asNamespace(namespace.replace(/^namespace:/, ''));
  return createOrchestratorFacade(undefined, { tenant: resolvedTenant, namespace: resolvedNamespace });
};

export const runScenarioWithEngine = async (
  request: AnalyzeRequest,
  dependencies: OrchestratorDependencies,
): Promise<Result<AnalyzeResult>> => {
  const facade = createScenarioEngine(
    dependencies,
    {
      tenant: request.tenant,
      namespace: request.namespace,
      window: asWindow(`window:${request.tenant.replace('tenant:', '')}`),
    },
    await createNoopEmitter(request),
  );
  return facade.startScenario(request);
};

const createNoopEmitter = async (request: AnalyzeRequest): Promise<{
  readonly emit: (event: { kind: string; payload: unknown }, runId: `run:${string}`) => Promise<AnalyticsStoreSignalEvent>;
}> => ({
  emit: async (event, runId) => ({
    id: `event:${Date.now()}` as `event:${number}`,
    kind: `signal:${event.kind.replace(/^signal:/, '')}` as `signal:${string}`,
    runId,
    session: asSession(`session:no-op`),
    tenant: request.tenant,
      namespace: request.namespace,
      window: asWindow('window:no-op'),
    payload: event.payload as JsonValue,
    at: new Date().toISOString(),
  }),
});
