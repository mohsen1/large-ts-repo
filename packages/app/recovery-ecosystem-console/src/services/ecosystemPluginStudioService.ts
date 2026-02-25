import {
  asTenant,
  asNamespace,
  asWindow,
  asRun,
  type AnalyticsRun,
  asSignal,
} from '@domain/recovery-ecosystem-analytics';
import {
  createInMemorySignalAdapter,
  runScenarioWithEngine,
  type OrchestratorDependencies,
} from '@service/recovery-ecosystem-analytics-orchestrator';
import {
  summarizeRunDiagnostics,
  type PluginRunResult,
  type PluginNode,
  type PluginRunInput,
} from '@domain/recovery-ecosystem-analytics';
import { type Result, ok } from '@shared/result';
import { type JsonValue } from '@shared/type-level';

export interface StudioSignal {
  readonly kind: string;
  readonly value: number;
  readonly payload: Record<string, unknown>;
}

export interface StudioPlan {
  readonly id: string;
  readonly route: readonly string[];
  readonly diagnostics: readonly string[];
}

export interface StudioService {
  readonly loadCatalog: () => Promise<readonly PluginNode[]>;
  readonly run: (request: {
    readonly signals: readonly { readonly kind: string; readonly payload: JsonValue }[];
    readonly tenant: string;
    readonly namespace: string;
  }) => Promise<Result<{ readonly runId: AnalyticsRun }>>;
  readonly start: (signals: readonly StudioSignal[]) => Promise<Result<{ readonly runId: string }>>;
  readonly diagnostics: (runId: string) => Promise<Result<readonly string[]>>;
}

const normalizeKind = (kind: string): `signal:${string}` => `signal:${kind.replace(/^signal:/, '').toLowerCase()}`;
const seedWindow = asWindow('window:studio');

const toPayload = (seed: string): JsonValue => ({
  source: 'ecosystem-console',
  seed,
  values: seed.split('').map((entry, index) => index + entry.charCodeAt(0)),
});

const toRunInput = (signal: StudioSignal, runId: string): PluginRunInput => ({
  runId: asRun(runId),
  kind: normalizeKind(signal.kind),
  namespace: asNamespace('namespace:recovery-ecosystem'),
  at: new Date().toISOString(),
  value: Number.isFinite(signal.value) ? signal.value : 1,
  payload: signal.payload as JsonValue,
});

const toRunInputEvents = (signals: readonly StudioSignal[], runId: string): readonly PluginRunInput[] =>
  signals.map((signal) => toRunInput(signal, runId));

export const usePluginStudioService = (
  tenant = 'tenant:default',
  namespace = 'namespace:recovery-ecosystem',
): StudioService => {
  const resolvedTenant = asTenant(tenant);
  const resolvedNamespace = asNamespace(namespace);
  void seedWindow;

  const loadCatalog = async (): Promise<readonly PluginNode[]> => {
    const { pluginCatalogSeedNodes } = await import('@domain/recovery-ecosystem-analytics');
    return [...pluginCatalogSeedNodes];
  };

  const run = async (request: {
    readonly tenant: string;
    readonly namespace: string;
    readonly signals: readonly { readonly kind: string; readonly payload: JsonValue }[];
  }): Promise<Result<{ readonly runId: AnalyticsRun }>> => {
    const adapter = await createInMemorySignalAdapter();
    const result = await runScenarioWithEngine(
      {
        tenant: asTenant(request.tenant),
        namespace: asNamespace(request.namespace),
        signals: request.signals,
      },
      { store: adapter.store },
    );
    return result.ok
      ? ok({ runId: result.value.runId })
      : result;
  };

  const start = async (signals: readonly StudioSignal[]): Promise<Result<{ readonly runId: string }>> => {
    const runId = asRun(`studio:${Date.now()}`).toString();
    const request = {
      tenant: resolvedTenant,
      namespace: resolvedNamespace,
      signals: signals.map((signal) => ({
        kind: normalizeKind(signal.kind),
        payload: toPayload(signal.kind),
      })),
    };
    const adapter = await createInMemorySignalAdapter();
    const result = await runScenarioWithEngine(request, { store: adapter.store } as OrchestratorDependencies);
    if (!result.ok) {
      return result;
    }
    return ok({ runId: runId.toString() });
  };

  const diagnostics = async (runId: string): Promise<Result<readonly string[]>> => {
    const adapter = await createInMemorySignalAdapter();
    const events = await adapter.store.read(asRun(runId));
    const runInputs: PluginRunInput[] = events.map((entry) => ({
      runId: asRun(entry.runId),
      kind: asSignal(entry.kind),
      namespace: entry.namespace,
      at: entry.at,
      value: entry.payload === null ? 1 : typeof entry.payload === 'number' ? entry.payload : 1,
      payload: entry.payload as JsonValue,
    }));

    const fake = runInputs.map((entry): PluginRunResult => ({
      plugin: `plugin:${entry.kind.replace('signal:', '')}` as const,
      accepted: true,
      signalCount: entry.value,
      payload: entry.payload,
      diagnostics: [{ step: entry.kind, latencyMs: 1 }],
    }));
    summarizeRunDiagnostics(fake);
    return ok(fake.map((entry) => `${entry.plugin}:${entry.signalCount}`));
  };

  return {
    loadCatalog,
    run,
    start,
    diagnostics,
  };
};

export const buildStudioPlan = (signals: readonly StudioSignal[]): StudioPlan => {
  const route = signals.map((entry) => normalizeKind(entry.kind));
  const unique = [...new Set(route)];
  const diagnostics = [
    `tenant:${signals.length}`,
    `signals:${unique.length}`,
    `session:${asRun(`studio-${Date.now()}`)}`,
  ];
  const id = unique.join('|') || 'studio:empty';
  return { id, route: unique, diagnostics };
};

export const createStudioInputs = (signals: readonly StudioSignal[], runId: string): readonly PluginRunInput[] =>
  signals.map((signal) => toRunInput(signal, runId));

export const createStudioRunInput = (signals: readonly StudioSignal[], runId: string): ReturnType<typeof toRunInputEvents> =>
  toRunInputEvents(signals, runId);
