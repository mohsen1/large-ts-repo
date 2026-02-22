import { useCallback, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import type { RecoverySignal } from '@domain/recovery-operations-models';
import { buildSignalTransitions, dedupeSignals, splitByWindow, summarizeSignals } from '@domain/recovery-fusion-intelligence';
import { InMemoryRecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RecoveryRunState } from '@domain/recovery-orchestration';

export interface FusionSignalEnvelope {
  readonly id: string;
  readonly tenant: string;
  readonly signal: RecoverySignal & { detectedAt: string };
  readonly observedAt: string;
}

export interface UseRecoveryFusionSignalsResult {
  readonly tenant: string;
  readonly signals: readonly FusionSignalEnvelope[];
  readonly summary: readonly string[];
  readonly clusterCount: number;
  readonly transitions: readonly string[];
  readonly error?: string;
  readonly loadSignal: (tenant: string, payload: unknown[]) => void;
  readonly clear: () => void;
  readonly runRepositoryPing: () => Promise<string>;
  readonly windowOverview: string | undefined;
}

const defaultBudget = {
  maxParallelism: 4,
  maxRetries: 4,
  timeoutMinutes: 60,
  operatorApprovalRequired: false,
};

const buildRunId = (tenant: string, signalId: string): RecoveryRunState['runId'] =>
  withBrand(`${tenant}:run:${signalId}`, 'RecoveryRunId');

const normalizeSignal = (tenant: string, raw: unknown, fallbackAt: string): RecoverySignal => {
  const input = raw as Partial<RecoverySignal>;
  const severity = typeof input.severity === 'number' ? input.severity : 1;
  const confidence = typeof input.confidence === 'number' ? input.confidence : 0.5;
  const source = typeof input.source === 'string' ? input.source : 'fusion-input';
  return {
    id: typeof input.id === 'string' && input.id ? input.id : `sig:${fallbackAt}`,
    source,
    severity,
    confidence,
    detectedAt: typeof input.detectedAt === 'string' ? input.detectedAt : fallbackAt,
    details: typeof input.details === 'object' && input.details !== null ? input.details : {},
  };
};

export const useRecoveryFusionSignals = (): UseRecoveryFusionSignalsResult => {
  const [tenant, setTenant] = useState('global');
  const [signals, setSignals] = useState<readonly FusionSignalEnvelope[]>([]);
  const [windowOverview, setWindowOverview] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const loadSignal = useCallback((selectedTenant: string, payload: unknown[]) => {
    const now = new Date().toISOString();
    const parsed: RecoverySignal[] = payload.map((raw, index) => normalizeSignal(selectedTenant, raw, `${selectedTenant}-${index}:${now}`));

    const deduped = dedupeSignals(
      parsed.map((entry) => ({
        ...entry,
        runId: buildRunId(selectedTenant, entry.id),
        incidentId: undefined,
        tags: [selectedTenant, 'api'],
        payload: { source: entry.source },
        details: entry.details,
        observedAt: entry.detectedAt,
      })),
    ).map((signal, index) => ({
      id: `${selectedTenant}:deduped:${index}`,
      tenant: selectedTenant,
      signal: {
        ...signal,
        detectedAt: signal.observedAt,
      },
      observedAt: signal.observedAt,
    }));

    const transitions = buildSignalTransitions(
      deduped.map((entry) => ({
        ...entry.signal,
        runId: buildRunId(selectedTenant, entry.id),
        incidentId: undefined,
        tags: ['adapter', selectedTenant],
        payload: {},
        details: entry.signal.details,
        observedAt: entry.signal.detectedAt,
      })),
    );

    const window = splitByWindow(
      deduped.map((entry) => ({
        ...entry.signal,
        runId: buildRunId(selectedTenant, entry.id),
        incidentId: undefined,
        tags: ['split', selectedTenant],
        payload: {},
        details: entry.signal.details,
        observedAt: entry.signal.detectedAt,
      })),
      now,
      new Date(Date.now() + 30_000).toISOString(),
      defaultBudget,
    );

    setTenant(selectedTenant);
    setSignals((existing) => [...deduped, ...existing].slice(0, 120));
    setWindowOverview(
      `clusters=${window.clusters.length}; signals=${window.clusters.reduce((count, cluster) => count + cluster.count, 0)}; transitions=${transitions.length}`,
    );
  }, []);

  const clear = useCallback(() => {
    setSignals([]);
    setWindowOverview(undefined);
  }, []);

  const runRepositoryPing = useCallback(async () => {
    try {
      const repository = new InMemoryRecoveryOperationsRepository();
      const snapshot = await repository.loadLatestSnapshot(tenant);
      return `repository-sessions=${snapshot?.sessions.length ?? 0}`;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'repository error';
      setError(message);
      return `repository-queries=${message}`;
    }
  }, [tenant]);

  const summary = useMemo(
    () =>
      summarizeSignals(
        signals.map((entry) => ({
          ...entry.signal,
          runId: buildRunId(tenant, entry.id),
          incidentId: undefined,
          tags: ['summary'],
          payload: {},
          details: entry.signal.details,
          observedAt: entry.signal.detectedAt,
        })),
      ),
    [tenant, signals],
  );

  const transitions = useMemo(
    () =>
      buildSignalTransitions(
        signals.map((entry) => ({
          ...entry.signal,
          runId: buildRunId(tenant, entry.id),
          incidentId: undefined,
          tags: ['transition'],
          payload: {},
          details: entry.signal.details,
          observedAt: entry.signal.detectedAt,
        })),
      ).map((transition) => `${transition.from}->${transition.to}`),
    [tenant, signals],
  );

  const clusterCount = useMemo(() => {
    const window = splitByWindow(
      signals.map((entry) => ({
        ...entry.signal,
        runId: buildRunId(tenant, entry.id),
        incidentId: undefined,
        tags: ['cluster'],
        payload: {},
        details: entry.signal.details,
        observedAt: entry.signal.detectedAt,
      })),
      new Date().toISOString(),
      new Date(Date.now() + 30_000).toISOString(),
      defaultBudget,
    );
    return window.clusters.length;
  }, [tenant, signals]);

  return useMemo(
    () => ({
      tenant,
      signals,
      summary,
      clusterCount,
      transitions,
      error,
      loadSignal,
      clear,
      runRepositoryPing,
      windowOverview,
    }),
    [tenant, signals, summary, clusterCount, transitions, error, loadSignal, clear, runRepositoryPing, windowOverview],
  );
};
