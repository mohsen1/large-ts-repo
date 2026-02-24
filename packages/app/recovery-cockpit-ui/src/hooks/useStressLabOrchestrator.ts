import { useCallback, useEffect, useMemo, useState } from 'react';
import { z } from 'zod';
import {
  executeOrchestratorSafe,
  type StagePhase,
  type WorkbenchMode,
  createTenantId,
  normalizeWorkbenchTopologyFromUnknown,
} from '@domain/recovery-stress-lab';
import { createPluginTelemetryStore, type PluginId } from '@shared/stress-lab-runtime';

export type StressLabStatus = 'idle' | 'planning' | 'running' | 'succeeded' | 'failed';

export interface StressLabCommand {
  readonly tenantId: string;
  readonly topology: unknown;
  readonly selectedRunbookIds: readonly string[];
  readonly selectedSignalIds: readonly string[];
  readonly mode: WorkbenchMode;
}

export interface StressLabState {
  readonly status: StressLabStatus;
  readonly phase: StagePhase;
  readonly runId: string;
  readonly tenantId: string;
  readonly selectedMode: WorkbenchMode;
  readonly selectedRunbookIds: readonly string[];
  readonly selectedSignalIds: readonly string[];
  readonly traces: readonly string[];
  readonly traceHash: string;
  readonly errors: readonly string[];
}

export interface StressLabActions {
  start: () => Promise<void>;
  setMode: (mode: WorkbenchMode) => void;
  updateTopology: (topology: unknown) => void;
  appendRunbook: (id: string) => void;
  appendSignal: (id: string) => void;
  clearErrors: () => void;
}

const commandSchema = z.object({
  tenantId: z.string().min(2),
  topology: z.unknown(),
  selectedRunbookIds: z.array(z.string().min(2)),
  selectedSignalIds: z.array(z.string().min(2)),
  mode: z.enum(['plan', 'simulate', 'recommend', 'report']),
});

const fallbackTopology = {
  tenantId: 'tenant-recovery-stress',
  nodes: [
    { id: 'edge-a', name: 'Edge API', ownerTeam: 'platform', criticality: 4, active: true },
    { id: 'cache-a', name: 'Cache', ownerTeam: 'platform', criticality: 3, active: true },
    { id: 'db-a', name: 'Primary DB', ownerTeam: 'platform', criticality: 5, active: true },
  ],
  edges: [
    { from: 'edge-a', to: 'cache-a', coupling: 0.72, reason: 'read path' },
    { from: 'cache-a', to: 'db-a', coupling: 0.85, reason: 'write path' },
  ],
};

const fallbackCommand: StressLabCommand = {
  tenantId: 'tenant-recovery-stress',
  topology: fallbackTopology,
  selectedRunbookIds: ['runbook:orchestrate-cache', 'runbook:drain-fallback'],
  selectedSignalIds: ['signal:latency-spike', 'signal:error-storm'],
  mode: 'plan',
};

const computeHash = (command: {
  tenantId: string;
  selectedRunbookIds: readonly string[];
  selectedSignalIds: readonly string[];
  mode: WorkbenchMode;
}) => `${command.tenantId}:${command.mode}:${command.selectedRunbookIds.length}:${command.selectedSignalIds.length}`;

const toSafeTopology = (tenantId: string, topology: unknown) => {
  const fallback = normalizeWorkbenchTopologyFromUnknown(fallbackTopology);
  if (topology === null || topology === undefined || typeof topology !== 'object') {
    return fallback;
  }

  const asRecord = topology as {
    tenantId?: string;
    nodes?: unknown;
    edges?: unknown;
  };

  if (!Array.isArray(asRecord.nodes) || !Array.isArray(asRecord.edges)) {
    return fallback;
  }

  return normalizeWorkbenchTopologyFromUnknown({
    tenantId: String(asRecord.tenantId ?? tenantId),
    nodes: asRecord.nodes.map((node) => {
      const entry = node as {
        id?: string;
        name?: string;
        ownerTeam?: string;
        criticality?: number;
        active?: boolean;
      };
      return {
        id: entry.id ?? 'unknown',
        name: entry.name ?? 'unknown',
        ownerTeam: entry.ownerTeam ?? 'unknown',
        criticality: Number(entry.criticality ?? 1),
        active: Boolean(entry.active),
      };
    }),
    edges: asRecord.edges.map((edge) => {
      const entry = edge as {
        from?: string;
        to?: string;
        coupling?: number;
        reason?: string;
      };
      return {
        from: entry.from ?? 'unknown',
        to: entry.to ?? 'unknown',
        coupling: Number(entry.coupling ?? 0),
        reason: entry.reason ?? 'inferred',
      };
    }),
  });
};

export const useStressLabOrchestrator = (seed: Partial<StressLabCommand> = {}): StressLabState & StressLabActions => {
  const parsed = commandSchema.safeParse({
    ...fallbackCommand,
    ...seed,
  });
  const initial = parsed.success ? parsed.data : fallbackCommand;

  const [tenantId, setTenantId] = useState(initial.tenantId);
  const [topology, setTopology] = useState(initial.topology);
  const [mode, setModeState] = useState<WorkbenchMode>(initial.mode);
  const [runbookIds, setRunbookIds] = useState(initial.selectedRunbookIds);
  const [signalIds, setSignalIds] = useState(initial.selectedSignalIds);
  const [status, setStatus] = useState<StressLabStatus>('idle');
  const [phase, setPhase] = useState<StagePhase>('plan');
  const [runId, setRunId] = useState('');
  const [traces, setTraces] = useState<readonly string[]>([]);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [traceHash, setTraceHash] = useState('');

  const telemetry = useMemo(() => createPluginTelemetryStore(tenantId, 'stress-lab/ui' as const), [tenantId]);
  const normalizedTopology = useMemo(() => toSafeTopology(tenantId, topology), [tenantId, topology]);

  useEffect(() => {
    const nextHash = computeHash({ tenantId, selectedRunbookIds: runbookIds, selectedSignalIds: signalIds, mode });
    setTraceHash(nextHash);
  }, [tenantId, runbookIds, signalIds, mode]);

  const setMode = useCallback((next: WorkbenchMode) => {
    setModeState(next);
  }, []);

  const appendRunbook = useCallback((id: string) => {
    setRunbookIds((current: readonly string[]) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const appendSignal = useCallback((id: string) => {
    setSignalIds((current: readonly string[]) => (current.includes(id) ? current : [...current, id]));
  }, []);

  const updateTopology = useCallback((next: unknown) => {
    setTopology(next);
  }, []);

  const clearErrors = useCallback(() => {
    setErrors([]);
  }, []);

  const start = useCallback(async () => {
    setErrors([]);
    setStatus('planning');
    setTraces([]);
    setRunId('');

      const telemetryPlugin = `ui:${tenantId}` as PluginId;
      telemetry.emit('info', telemetryPlugin, `run started for ${tenantId}`, [runbookIds.length, signalIds.length]);

    try {
      const topologySnapshot = normalizedTopology;
      const output = await executeOrchestratorSafe({
        tenantId,
        topology: topologySnapshot,
        selectedRunbooks: runbookIds,
        selectedSignals: signalIds,
        mode,
      });

      setRunId(output.runId);
      setPhase(output.phase);
      setStatus(output.chain.ok ? 'succeeded' : 'failed');
      setTraces((current) => [...current, ...output.chain.traces.map((entry): string => `${entry.status}:${entry.pluginId}`)]);
      telemetry.emit('info', telemetryPlugin, `run complete ${output.runId}`, [output.chain.traces.length]);
      setTenantId(createTenantId(topologySnapshot.tenantId));
    } catch (error) {
      setStatus('failed');
      const message = error instanceof Error ? error.message : String(error);
      setErrors((current) => [...current, message]);
      telemetry.emit('error', telemetryPlugin, `run failed ${message}`, [1]);
    }
  }, [mode, normalizedTopology, runbookIds, signalIds, telemetry, tenantId]);

  return {
    status,
    phase,
    runId,
    tenantId,
    selectedMode: mode,
    selectedRunbookIds: runbookIds,
    selectedSignalIds: signalIds,
    traces,
    traceHash,
    errors,
    start,
    setMode,
    updateTopology,
    appendRunbook,
    appendSignal,
    clearErrors,
  };
};
