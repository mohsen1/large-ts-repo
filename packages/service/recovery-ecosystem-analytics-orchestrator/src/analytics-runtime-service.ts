import { asWindow, asTenant, asSession, asRun, type AnalyticsRun, type AnalyticsTenant, type SignalNamespace, type AnalyticsWindow } from '@domain/recovery-ecosystem-analytics';
import {
  pluginCatalogSeed,
  summarizeRunDiagnostics,
  type PluginRunResult,
  type PluginRunInput,
} from '@domain/recovery-ecosystem-analytics';
import { createInMemorySignalAdapter } from './adapters';
import type { OrchestratorDependencies } from './ports';
import { mapWithIteratorHelpers } from '@shared/type-level';
import { ok, type Result } from '@shared/result';
import type { AnalyticsStoreSignalEvent } from '@data/recovery-ecosystem-analytics-store';
import type { JsonValue } from '@shared/type-level';

export interface RuntimeServiceWorkspace {
  readonly tenant: AnalyticsTenant;
  readonly namespace: SignalNamespace;
  readonly window: AnalyticsWindow;
  readonly session: ReturnType<typeof asSession>;
}

export interface RuntimeServiceSeed {
  readonly id: string;
  readonly workspace: RuntimeServiceWorkspace;
  readonly plan: readonly string[];
}

export interface RuntimeServiceFacade {
  readonly workspace: RuntimeServiceWorkspace;
  readonly run: (input: PluginRunInput[]) => Promise<Result<{ readonly diagnostics: readonly PluginRunResult[] }>>;
  readonly seedEvents: () => Promise<Result<readonly AnalyticsStoreSignalEvent[]>>;
  readonly seedPlan: () => Promise<RuntimeServiceSeed>;
}

const bootstrapSeed = {
  tenant: asTenant('tenant:runtime'),
  namespace: 'namespace:recovery-ecosystem-runtime' as SignalNamespace,
  window: asWindow('window:runtime'),
  session: asSession('session:runtime'),
  plan: ['bootstrap', 'normalize', 'evaluate', 'publish'],
} as const;

const toNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

const withInputKind = (kind: string): `signal:${string}` => `signal:${kind.replace(/^signal:/, '').toLowerCase()}`;

const normalizePayload = (value: Record<string, JsonValue>): JsonValue => value as JsonValue;

const buildWorkspace = (): RuntimeServiceWorkspace => ({
  tenant: bootstrapSeed.tenant,
  namespace: bootstrapSeed.namespace,
  window: bootstrapSeed.window,
  session: bootstrapSeed.session,
});

export const createRuntimeService = async (dependencies?: Partial<OrchestratorDependencies>): Promise<RuntimeServiceFacade> => {
  const adapter = await createInMemorySignalAdapter();
  const catalog = Object.keys(pluginCatalogSeed).toSorted((left, right) => left.localeCompare(right));
  const workspace = buildWorkspace();

  const run = async (input: PluginRunInput[]): Promise<Result<{ readonly diagnostics: readonly PluginRunResult[] }>> => {
    const sorted = [...input].sort((left, right) => left.kind.localeCompare(right.kind));
    const diagnostics = sorted.map(
      (entry): PluginRunResult => ({
        plugin: `plugin:${entry.kind.replace('signal:', 'runtime')}` as const,
        accepted: true,
        signalCount: toNumber(entry.value),
        payload: entry.payload,
        diagnostics: [{ step: entry.kind, latencyMs: 1 }],
      }),
    );

    const baseline = catalog.slice(0, Math.max(1, Math.floor(catalog.length / 2)));
    await Promise.all(
      sorted.map(async (entry, index) => {
        const event: AnalyticsStoreSignalEvent = {
          id: `event:${Date.now() + index}` as `event:${number}`,
          kind: withInputKind(entry.kind),
          runId: entry.runId,
          session: asSession(`session:${entry.runId}`),
          tenant: workspace.tenant,
          namespace: workspace.namespace,
          window: workspace.window,
          payload: normalizePayload(typeof entry.payload === 'object' && entry.payload !== null ? (entry.payload as Record<string, JsonValue>) : {}),
          at: entry.at,
        };
        await adapter.store.append(event);
      }),
    );

    const eventDiagnostics = summarizeRunDiagnostics(diagnostics);
    void eventDiagnostics;
    return ok({ diagnostics });
  };

  const seedEvents = async (): Promise<Result<readonly AnalyticsStoreSignalEvent[]>> => {
    const runId = `run:${workspace.tenant.replace('tenant:', '')}` as `run:${string}`;
    await adapter.store.open({
      runId,
      tenant: workspace.tenant,
      namespace: workspace.namespace,
      window: workspace.window,
      session: workspace.session,
    });

    const events = await adapter.store.read(runId);
    return ok(events);
  };

  const seedPlan = async (): Promise<RuntimeServiceSeed> => {
    const runId = asRun(`plan:${workspace.tenant.replace('tenant:', '')}`);
    return {
      id: runId,
      workspace,
      plan: mapWithIteratorHelpers(bootstrapSeed.plan, (entry) => entry),
    };
  };

  return {
    workspace,
    run,
    seedEvents,
    seedPlan,
  };
};
