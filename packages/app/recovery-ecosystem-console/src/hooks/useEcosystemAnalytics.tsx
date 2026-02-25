import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AnalyticsSignalSummary } from '@domain/recovery-ecosystem-analytics';
import { asTenant, asNamespace, withDefaultPlanWindow } from '@domain/recovery-ecosystem-analytics';
import { useAnalyticsService } from '../services/analyticsService';

type DashboardMode = 'overview' | 'drill' | 'timeline';

interface ScenarioInput {
  readonly tenant: string;
  readonly namespace: string;
  readonly signalKinds: readonly string[];
}

interface UseEcosystemAnalyticsState {
  readonly mode: DashboardMode;
  readonly loading: boolean;
  readonly errors: readonly string[];
  readonly summary: AnalyticsSignalSummary | undefined;
  readonly eventTrace: readonly string[];
}

interface UseEcosystemAnalyticsActions {
  readonly run: (input: ScenarioInput) => Promise<void>;
  readonly clear: () => void;
  readonly setMode: (mode: DashboardMode) => void;
  readonly bootstrap: () => Promise<void>;
}

type ServiceState = ReturnType<typeof useAnalyticsService>;

const defaultError = (cause: unknown): string =>
  cause instanceof Error ? cause.message : 'unexpected-error';

const normalizeSignalKinds = (signalKinds: readonly string[]): readonly string[] =>
  [...new Set(signalKinds.map((signal) => signal.trim().toLowerCase()).filter(Boolean))];

const summarizeEvents = (events: readonly string[]): readonly string[] =>
  events
    .map((entry, index) => `${index + 1}:${entry}`)
    .toSorted()
    .slice(0, 20);

export const useEcosystemAnalytics = (
  tenant: string,
  namespace: string,
): UseEcosystemAnalyticsState & UseEcosystemAnalyticsActions => {
  const tenantId = asTenant(tenant);
  const namespaceId = asNamespace(namespace);
  const [mode, setMode] = useState<DashboardMode>('overview');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [summary, setSummary] = useState<AnalyticsSignalSummary | undefined>(undefined);
  const [trace, setTrace] = useState<readonly string[]>([]);
  const [service, setService] = useState<ServiceState | undefined>(undefined);

  useEffect(() => {
    const scope = new AbortController();
    const create = async (): Promise<void> => {
      const instance = useAnalyticsService({
        tenant: tenantId,
        namespace: namespaceId,
      });
      if (!scope.signal.aborted) {
        setService(instance);
      }
    };
    void create();
    return () => scope.abort();
  }, [tenant, namespace, tenantId, namespaceId]);

  const bootstrap = useCallback(async () => {
    if (!service) {
      return;
    }
    setLoading(true);
    setErrors([]);
    try {
      const events = await service.hydrateSignals();
      const traceValues = summarizeEvents(events.map((event) => `${event.kind}@${event.at}`));
      const result = await service.createOrchestratorResult();
      if (!result.ok) {
        throw result.error;
      }
      const payload = result.value;
      setSummary({
        signalCount: payload.summary.signals.length,
        warningCount: Math.max(0, payload.summary.matrix.nodes.length - 2),
        criticalCount: payload.summary.signals.length > 6 ? 1 : 0,
        score: payload.summary.score ?? 0,
      });
      const baseWindow = withDefaultPlanWindow(tenantId, namespaceId);
      setTrace([`bootstrap:${payload.runId}`, `window:${baseWindow}`, `events:${events.length}`, ...traceValues]);
    } catch (cause) {
      setErrors((previous) => [...previous, defaultError(cause)]);
    } finally {
      setLoading(false);
    }
  }, [service, tenantId, namespaceId, trace]);

  const run = useCallback(async (input: ScenarioInput) => {
    if (!service) {
      setErrors((previous) => [...previous, 'service-not-ready']);
      return;
    }
    setLoading(true);
    setErrors([]);
    try {
      const kinds = normalizeSignalKinds(input.signalKinds);
      const result = await service.runScenario({
        tenant: input.tenant,
        namespace: input.namespace,
        signalKinds: kinds,
      });
      if (!result.ok) {
        throw result.error;
      }
      setSummary({
        signalCount: result.value.summary.signals.length,
        warningCount: kinds.length % 2,
        criticalCount: kinds.length > 5 ? 1 : 0,
        score: result.value.summary.score,
      });
      setTrace((previous) => [`run:${result.value.runId}`, `events:${result.value.eventCount}`, ...previous]);
    } catch (cause) {
      setErrors((previous) => [...previous, defaultError(cause)]);
      setSummary(undefined);
    } finally {
      setLoading(false);
    }
  }, [service]);

  const clear = useCallback(() => {
    setTrace([]);
    setErrors([]);
    setSummary(undefined);
    setMode('overview');
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  return useMemo(
    () => ({
      mode,
      loading,
      errors,
      summary,
      eventTrace: trace,
      run,
      clear,
      setMode,
      bootstrap,
    }),
    [mode, loading, errors, summary, trace, run, bootstrap],
  );
};
