import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  bootstrapCatalog,
  type ConvergenceInput,
  type ConvergenceOutput,
  type ConvergenceRunId,
  type ConvergenceStage,
  createInputFromTopology,
  runConvergenceSeed,
  loadConvergenceTemplates,
} from '@domain/recovery-lab-orchestration-core';
import {
  type TenantId,
  type WorkloadTopology,
  type WorkloadTopologyEdge,
  type WorkloadTopologyNode,
  createTenantId,
} from '@domain/recovery-stress-lab';

type RunStage = 'idle' | 'running' | 'ready' | 'error';

type HookMode = 'tenant' | 'topology' | 'signal' | 'policy' | 'fleet';

interface RunRecord {
  readonly stage: ConvergenceStage;
  readonly pluginCount: number;
  readonly diagnostics: readonly string[];
}

interface ConvergenceState {
  readonly stage: RunStage;
  readonly mode: HookMode;
  readonly runId: ConvergenceRunId | null;
  readonly topologySize: number;
  readonly templates: number;
  readonly diagnostics: readonly string[];
  readonly rows: readonly RunRecord[];
  readonly output: ConvergenceOutput | null;
  readonly startedAt: string | null;
  readonly endedAt: string | null;
}

const buildNode = (index: number): WorkloadTopologyNode => ({
  id: `node-${index}` as WorkloadTopologyNode['id'],
  name: `node-${index}`,
  ownerTeam: `team-${index % 3}`,
  criticality: ((index % 5) + 1) as WorkloadTopologyNode['criticality'],
  active: true,
});

const buildEdge = (from: WorkloadTopologyNode, to: WorkloadTopologyNode, weight: number): WorkloadTopologyEdge => ({
  from: from.id,
  to: to.id,
  coupling: Math.max(0.01, Math.min(1, weight)),
  reason: `${from.id}->${to.id}`,
});

const buildTopology = (seed: number): WorkloadTopology => {
  const nodes: WorkloadTopologyNode[] = Array.from({ length: Math.max(4, (seed % 8) + 4) }, (_, index) => buildNode(index));
  const edges = nodes
    .flatMap((node, index) =>
      nodes
        .filter((_, nextIndex) => nextIndex !== index && (index + nextIndex + seed) % 3 !== 0)
        .slice(0, 2)
        .map((to, targetIndex) => buildEdge(node, to, ((index + targetIndex + 1) * (seed + 1)) / 10)),
    )
    .toSorted((left, right) => (left.from > right.from ? 1 : -1));

  const tenantId = `tenant-recovery-${seed}` as TenantId;
  return {
    tenantId: createTenantId(tenantId),
    nodes,
    edges,
  };
};

const summarizeRows = (records: readonly RunRecord[]) =>
  records
    .map((row) => `${row.stage}:${row.pluginCount}`)
    .join(' | ');

export const useRecoveryLabConvergence = () => {
  const [runId, setRunId] = useState<ConvergenceRunId | null>(null);
  const [stage, setStage] = useState<RunStage>('idle');
  const [mode, setMode] = useState<HookMode>('tenant');
  const [seed, setSeed] = useState(5);
  const [rows, setRows] = useState<readonly RunRecord[]>([]);
  const [output, setOutput] = useState<ConvergenceOutput | null>(null);
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [templateCount, setTemplateCount] = useState<number>(0);

  const topology = useMemo<WorkloadTopology>(() => buildTopology(seed), [seed]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const templates = await loadConvergenceTemplates();
      if (cancelled) return;
      setTemplateCount(templates.length);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const run = useCallback(async () => {
    setStage('running');
    setStartedAt(new Date().toISOString());
    setRows([]);
    setDiagnostics([]);
    setOutput(null);
    setRunId(null);

    try {
      const localInput = createInputFromTopology(`tenant-${mode}-${seed}` as TenantId, topology);
      const response = await runConvergenceSeed(localInput.tenantId, topology, mode);
      const diagnostics = [
        ...response.summary.diagnostics,
        ...response.summary.manifestCount.toString().split('').map((char) => `manifest:${char}`),
      ];
      const trail: RunRecord[] = [
        {
          stage: response.output.stage,
          pluginCount: response.summary.manifestCount,
          diagnostics: diagnostics.slice(0, 4),
        },
      ];

      setOutput(response.output);
      setRows(trail);
      setRunId(response.summary.runId as ConvergenceRunId);
      setDiagnostics([...response.output.diagnostics, ...diagnostics]);
      setEndedAt(new Date().toISOString());
      setStage('ready');
    } catch (error) {
      setDiagnostics([error instanceof Error ? error.message : 'convergence failed']);
      setEndedAt(new Date().toISOString());
      setStage('error');
    }
  }, [mode, seed, topology]);

  const reset = useCallback(() => {
    setOutput(null);
    setRows([]);
    setDiagnostics([]);
    setRunId(null);
    setStartedAt(null);
    setEndedAt(null);
    setStage('idle');
  }, []);

  const adjustSeed = useCallback((delta: number) => {
    setSeed((current) => Math.max(3, current + delta));
  }, []);

  const state: ConvergenceState = {
    stage,
    mode,
    runId,
    topologySize: topology.nodes.length,
    templates: templateCount,
    diagnostics,
    rows,
    output,
    startedAt,
    endedAt,
  };

  return {
    state,
    mode,
    seed,
    run,
    reset,
    adjustSeed,
    setMode,
    topology,
    summarizeRows,
    localInput: createInputFromTopology(`tenant-${mode}-${seed}` as TenantId, topology),
  };
};
