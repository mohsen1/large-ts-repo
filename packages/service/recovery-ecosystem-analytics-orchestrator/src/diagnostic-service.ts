import {
  summarizeRunDiagnostics,
  buildEventLog,
  type PluginRunResult,
} from '@domain/recovery-ecosystem-analytics';
import { ok, type Result } from '@shared/result';
import {
  asRun,
  asTenant,
  asSession,
  asWindow,
  type AnalyticsRun,
  asNamespace,
} from '@domain/recovery-ecosystem-analytics';
import type { AnalyticsStore } from '@data/recovery-ecosystem-analytics-store';

const toSignalPayload = (seed: string, tenant: string, runId: string, namespace: string): unknown => ({
  kind: `signal:${seed}`,
  tenant,
  runId,
  namespace,
});

export interface RuntimeDiagnostic {
  readonly runId: AnalyticsRun;
  readonly namespace: string;
  readonly signal: string;
  readonly createdAt: string;
  readonly report: {
    readonly score: number;
    readonly warningCount: number;
    readonly criticalCount: number;
  };
}

export interface DiagnosticServiceDependencies {
  readonly store: AnalyticsStore;
}

export interface DiagnosticService {
  readonly analyze: (results: readonly PluginRunResult[]) => Promise<Result<RuntimeDiagnostic>>;
  readonly traceEvents: (runId: string) => Promise<readonly string[]>;
  readonly normalizeInput: (input: { readonly runId: string }) => string;
}

export interface TraceMap {
  readonly entries: Map<string, readonly string[]>;
  readonly sessions: Map<string, { readonly session: ReturnType<typeof asSession>; readonly window: ReturnType<typeof asWindow> }>;
}

const toSignalKind = (kind: string): `signal:${string}` => `signal:${kind.replace(/^signal:/, '').toLowerCase()}` as `signal:${string}`;

export const createDiagnosticService = (dependencies: DiagnosticServiceDependencies): DiagnosticService => {
  const store = dependencies.store;
  const sessions: TraceMap['sessions'] = new Map();
  const traces: TraceMap['entries'] = new Map();

  const toSessionNamespace = (seed: string): ReturnType<typeof asNamespace> =>
    asNamespace(`namespace:diagnostic-${seed}`);

  const ensureSession = (runId: string) => {
    const existing = sessions.get(runId);
    if (existing) {
      return existing;
    }
    const session = asSession(`diagnostic-${runId}`);
    const window = asWindow(`window:${runId}`);
    const next = { session, window };
    sessions.set(runId, next);
    return next;
  };

  const normalizeInput = (input: { readonly runId: string }): string => {
    const session = ensureSession(input.runId);
    return `${input.runId}:${session.session}`;
  };

  const analyze = async (results: readonly PluginRunResult[]): Promise<Result<RuntimeDiagnostic>> => {
    const diagnostics = summarizeRunDiagnostics(results);
    const runIdSeed = `run:${Date.now()}`;
    const runId = asRun(runIdSeed);
    const summary: RuntimeDiagnostic = {
      runId,
      namespace: asNamespace(`namespace:diagnostic-${runId.replace('run:', '')}`),
      signal: results[0]?.plugin ?? 'plugin:none',
      createdAt: new Date().toISOString(),
      report: {
        score: diagnostics.runMetrics.score,
        warningCount: diagnostics.runMetrics.warningCount,
        criticalCount: diagnostics.runMetrics.criticalCount,
      },
    };

    void buildEventLog(results);
    traces.set(runId, diagnostics.state.traces);
    return ok(summary);
  };

  const traceEvents = async (runId: string): Promise<readonly string[]> => {
    const existing = traces.get(runId);
    if (existing && existing.length > 0) {
      return existing;
    }

    const normalizedRunId = asRun(runId);
    const events = await store.read(normalizedRunId);
    if (events.length > 0) {
      const discovered = events.map((entry) => `${entry.runId}:${entry.kind}:${entry.at}`);
      traces.set(runId, discovered);
      return discovered;
    }

    const runs = await store.queryRuns({ tenant: asTenant(`tenant:${runId.replace('run:', '')}`) });
    if (runs.length === 0) {
      return [];
    }
    const fallbackRun = runs[0]?.runId;
    if (!fallbackRun) {
      return [];
    }
    const fallback = await store.read(fallbackRun);
    const discovered = fallback.map((entry) => `${entry.runId}:${entry.kind}:${entry.at}`);
    traces.set(runId, discovered);
    return discovered;
  };

  return {
    analyze,
    traceEvents,
    normalizeInput,
  };
};
