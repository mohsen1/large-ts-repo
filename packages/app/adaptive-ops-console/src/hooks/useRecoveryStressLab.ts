import { useCallback, useMemo, useState, useEffect } from 'react';
import {
  createRecoveryStressLabClient,
  type RecoveryLabClientHandle,
  type StressLabRunInput,
  type StressLabRunOutcome,
} from '../services/recoveryStressLabClient';
import {
  type RecoverySignal,
  type WorkloadTopology,
  type TenantId,
  createTenantId,
  createSignalId,
} from '@domain/recovery-stress-lab';

export interface StressLabHookState {
  readonly ready: boolean;
  readonly loading: boolean;
  readonly error: string | null;
  readonly lastOutcome: StressLabRunOutcome | null;
}

export interface StressLabHookInput {
  readonly tenantId: string;
  readonly topology: WorkloadTopology;
  readonly signals: readonly RecoverySignal[];
  readonly runbookIds: readonly string[];
  readonly band: 'low' | 'medium' | 'high' | 'critical';
}

const emptyTopology: WorkloadTopology = {
  tenantId: createTenantId('tenant-a'),
  nodes: [],
  edges: [],
};

const createDefaultSignals = (): readonly RecoverySignal[] => [
  {
    id: createSignalId('signal-default-1'),
    class: 'availability',
    severity: 'medium',
    title: 'baseline drift',
    createdAt: new Date().toISOString(),
    metadata: {
      tenant: 'tenant-a',
      source: 'default',
    },
  },
  {
    id: createSignalId('signal-default-2'),
    class: 'performance',
    severity: 'low',
    title: 'low memory pressure',
    createdAt: new Date().toISOString(),
    metadata: {
      tenant: 'tenant-a',
      source: 'default',
    },
  },
];

export const useRecoveryStressLab = (
  seedTopology: WorkloadTopology = emptyTopology,
  seedSignals: readonly RecoverySignal[] = createDefaultSignals(),
): {
  state: StressLabHookState;
  runOnce: (input?: Partial<StressLabHookInput>) => Promise<void>;
  updateTopology: (topology: WorkloadTopology) => void;
  updateSignals: (signals: readonly RecoverySignal[]) => void;
  updateRunbooks: (runbookIds: readonly string[]) => void;
  updateBand: (band: 'low' | 'medium' | 'high' | 'critical') => void;
  clearError: () => void;
  outputSignals: ReadonlyArray<string>;
  outputWarnings: ReadonlyArray<string>;
} => {
  const [tenantId] = useState<TenantId>(createTenantId('tenant-a'));
  const [topology, setTopology] = useState(seedTopology);
  const [signals, setSignals] = useState(seedSignals);
  const [runbookIds, setRunbookIds] = useState<readonly string[]>(['runbook-1', 'runbook-2']);
  const [band, setBand] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [readyState, setReadyState] = useState<StressLabHookState>({
    ready: false,
    loading: false,
    error: null,
    lastOutcome: null,
  });
  const [client, setClient] = useState<RecoveryLabClientHandle | null>(null);

  useEffect(() => {
    let ignore = false;
    void (async () => {
      const nextClient = await createRecoveryStressLabClient(tenantId);
      if (!ignore) {
        setClient(nextClient);
        setReadyState((current) => ({
          ...current,
          ready: true,
        }));
      }
    })();

    return () => {
      ignore = true;
    };
  }, [tenantId]);

  const runOnce = useCallback(
    async (input?: Partial<StressLabHookInput>) => {
      if (!client) {
        setReadyState((current) => ({ ...current, error: 'client not ready' }));
        return;
      }

      setReadyState((current) => ({ ...current, loading: true, error: null }));
      try {
      const nextInput: StressLabRunInput = {
          topology: input?.topology ?? topology,
          signals: input?.signals ?? signals,
          runbookIds: input?.runbookIds ?? runbookIds,
          band: input?.band ?? band,
          stages: ['stress', 'run'] as const,
        };

        const result = await client.client.runWithMetadata(nextInput);
        setReadyState({
          ready: true,
          loading: false,
          error: null,
          lastOutcome: result,
        });
      } catch (error) {
        setReadyState((current) => ({
          ...current,
          loading: false,
          error: error instanceof Error ? error.message : 'stress lab run failed',
        }));
      }
    },
    [band, client, topology, runbookIds, signals],
  );

  const outputSignals = useMemo(() => {
    const report = readyState.lastOutcome;
    if (!report) return [] as string[];
    return [String(report.seedRunbookId)];
  }, [readyState.lastOutcome]);

  const outputWarnings = useMemo(() => {
    const report = readyState.lastOutcome;
    if (!report) return [] as string[];
    return report.report.warnings;
  }, [readyState.lastOutcome]);

  const updateTopology = useCallback((nextTopology: WorkloadTopology) => {
    setTopology(nextTopology);
  }, []);

  const updateSignals = useCallback((nextSignals: readonly RecoverySignal[]) => {
    setSignals(nextSignals);
  }, []);

  const updateRunbooks = useCallback((nextRunbookIds: readonly string[]) => {
    setRunbookIds(nextRunbookIds);
  }, []);

  const updateBand = useCallback((nextBand: 'low' | 'medium' | 'high' | 'critical') => {
    setBand(nextBand);
  }, []);

  const clearError = useCallback(() => {
    setReadyState((current) => ({
      ...current,
      error: null,
    }));
  }, []);

  return {
    state: readyState,
    runOnce,
    updateTopology,
    updateSignals,
    updateRunbooks,
    updateBand,
    clearError,
    outputSignals,
    outputWarnings,
  };
};
