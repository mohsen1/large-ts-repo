import { type Result } from '@shared/result';
import {
  asSession,
  asWindow,
  asNamespace,
  asTenant,
  createScenarioEnvelope,
  type AnalyticsTenant,
  type SignalNamespace,
} from '@domain/recovery-ecosystem-analytics';
import {
  createInMemorySignalAdapter,
  runScenarioWithEngine,
  type OrchestratorDependencies,
  type AnalyzeRequest,
  type AnalyzeResult,
} from '@service/recovery-ecosystem-analytics-orchestrator';
import { type AnalyticsStoreSignalEvent, type AnalyticsStoreRunRecord } from '@data/recovery-ecosystem-analytics-store';
import type { JsonValue } from '@shared/type-level';

type AnalyzeInput = {
  readonly tenant: string;
  readonly namespace: string;
  readonly signalKinds: readonly string[];
};

export interface AnalyticsServiceConfig {
  readonly tenant: AnalyticsTenant;
  readonly namespace: SignalNamespace;
}

export interface AnalyticsService {
  readonly runScenario: (input: AnalyzeInput) => Promise<Result<AnalyzeResult>>;
  readonly hydrateSignals: () => Promise<readonly AnalyticsStoreSignalEvent[]>;
  readonly seedScenario: () => Promise<AnalyticsStoreRunRecord>;
  readonly createOrchestratorResult: () => Promise<Result<AnalyzeResult>>;
  readonly defaultWindow: ReturnType<typeof asWindow>;
}

const normalizeTenant = (tenant: string): AnalyticsTenant => asTenant(tenant.replace(/^tenant:/, ''));
const normalizeNamespace = (namespace: string): SignalNamespace => asNamespace(namespace.replace(/^namespace:/, ''));
const normalizeSignalKind = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, '-');
const withJsonPayload = (value: Record<string, unknown>): JsonValue => value as JsonValue;

const buildFingerprint = (tenant: AnalyticsTenant, namespace: SignalNamespace): `fingerprint:${string}`[] =>
  [tenant, namespace].map((entry) => `fingerprint:${entry}` as `fingerprint:${string}`);

export const useAnalyticsService = (config: AnalyticsServiceConfig): AnalyticsService => {
  const adapterPromise = createInMemorySignalAdapter();
  const tenant = config.tenant;
  const namespace = config.namespace;
  const defaultWindow = asWindow(`window:${tenant.replace('tenant:', '')}-${namespace.replace('namespace:', '')}`);
  const fingerprint = buildFingerprint(tenant, namespace);

  const buildRequest = (input: AnalyzeInput): AnalyzeRequest<readonly string[]> => ({
    tenant: normalizeTenant(input.tenant),
    namespace: normalizeNamespace(input.namespace),
    signals: input.signalKinds.filter(Boolean).map((kind) => ({
      kind: normalizeSignalKind(kind),
      payload: withJsonPayload({
        source: input.namespace,
        seed: fingerprint.join('|'),
      }),
    })),
  });

  const runScenario = async (input: AnalyzeInput): Promise<Result<AnalyzeResult>> => {
    const request = buildRequest(input);
    const dependencies: OrchestratorDependencies = {
      store: (await adapterPromise).store,
    };
    return runScenarioWithEngine(request, dependencies);
  };

  const hydrateSignals = async (): Promise<readonly AnalyticsStoreSignalEvent[]> => {
    const adapter = await adapterPromise;
    await adapter.store.open({
      runId: `run:${tenant.replace('tenant:', 'seed')}` as `run:${string}`,
      tenant,
      namespace,
      window: defaultWindow,
      session: asSession(`stream:${tenant}`),
    });
    return adapter.store.read(`run:${tenant.replace('tenant:', 'seed')}` as `run:${string}`);
  };

  const seedScenario = async (): Promise<AnalyticsStoreRunRecord> => {
    const scenario = createScenarioEnvelope(tenant.replace('tenant:', ''));
    const adapter = await adapterPromise;
    const runId = `run:seed:${scenario.id}` as `run:${string}`;
    await adapter.store.open({
      runId,
      tenant,
      namespace,
      window: defaultWindow,
      session: asSession(`seed:${scenario.id}`),
    });
    const runs = await adapter.store.queryRuns({ tenant });
    return (
      runs[0] ?? {
        runId,
        tenant,
        namespace,
        window: defaultWindow,
        session: asSession(`seed:${scenario.id}`),
        startedAt: new Date().toISOString(),
        status: 'draft',
        stages: [],
        metadata: {
          scenario: scenario.id,
        },
      }
    );
  };

  const createOrchestratorResult = async (): Promise<Result<AnalyzeResult>> => {
    return runScenario({
      tenant,
      namespace,
      signalKinds: ['ingest', 'policy', 'score', 'report'],
    });
  };

  return {
    runScenario,
    hydrateSignals,
    seedScenario,
    createOrchestratorResult,
    defaultWindow,
  };
};
