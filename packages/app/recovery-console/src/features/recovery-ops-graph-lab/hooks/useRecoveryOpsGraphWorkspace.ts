import { useCallback, useEffect, useMemo, useState } from 'react';
import { withBrand } from '@shared/core';
import {
  createOrchestratorRunner,
  getProfile,
  planAndRun,
  runWorkspaceOrchestration,
} from '@service/recovery-ops-graph-orchestrator';
import type {
  AnyGraphPlugin,
  PluginExecutionSummary,
  ProfileId,
  RecoveryWorkflow,
  OrchestratorInput,
  PluginId,
  PluginName,
  ISOTime,
  PluginSnapshot,
  RunId,
} from '@domain/recovery-ops-orchestration-graph';
import type { GraphLabWorkspaceState, SignalFeedItem, WorkspaceRow } from '../types';

type PluginCatalogEntry = {
  readonly id: PluginId;
  readonly name: PluginName;
};

type PluginSignalPayload = SignalFeedItem;

type WorkspacePluginResult = {
  readonly pluginId: PluginId;
  readonly runId: RunId;
  readonly records: readonly PluginSnapshot[];
  readonly diagnostics: readonly {
    readonly pluginId: PluginId;
    readonly startedAt: ISOTime;
    readonly durationMs: number;
    readonly stage: AnyGraphPlugin['stage'];
  }[];
};

const makePlugin = (
  id: string,
  label: string,
  stage: 'ingest' | 'plan' | 'simulate' | 'execute' | 'observe' | 'finalize',
  dependencies: readonly string[] = [],
): AnyGraphPlugin => {
  const brandedId = withBrand(id, 'RecoveryOpsPluginId');
  const brandedName = withBrand(label, 'RecoveryOpsPluginName');

  return {
    id: brandedId,
    name: brandedName,
    tenantScope: {
      tenantId: withBrand('tenant-primary', 'TenantId'),
      incidentId: withBrand('incident-0001', 'IncidentId'),
    },
    stage,
    dependencies: dependencies.map((entry) => withBrand(entry, 'RecoveryOpsPluginId')),
    metadata: {
      kind: 'ops-graph',
      version: '1.0.0',
      description: `Plugin ${label}`,
      tags: ['recovery', label],
      capabilities: [
        {
          key: `${label}:default`,
          weight: label.length,
          active: true,
        },
      ],
    },
    run: async (workflow, _context, profile) => {
      const jitter = Number.parseInt(workflow.id.slice(-3), 10) % 10;
      return {
        pluginId: brandedId,
        runId: workflow.runId,
        records: [
          {
            pluginId: brandedId,
            pluginName: brandedName,
            outputCount: Math.max(1, jitter),
            averagePayload: jitter + profile.strictness / 10,
            producedAt: new Date().toISOString() as ISOTime,
          },
        ],
        diagnostics: [
          {
            pluginId: brandedId,
            startedAt: new Date().toISOString() as ISOTime,
            durationMs: Math.max(80, jitter * 10),
            stage,
            memo: {
              workflow: workflow.graphLabel,
              strictness: profile.strictness,
            },
          },
        ],
      };
    },
  };
};

const pluginCatalog: readonly PluginCatalogEntry[] = [
  { id: withBrand('signal-ingest', 'RecoveryOpsPluginId'), name: withBrand('signal-ingest', 'RecoveryOpsPluginName') },
  { id: withBrand('run-planner', 'RecoveryOpsPluginId'), name: withBrand('run-planner', 'RecoveryOpsPluginName') },
  { id: withBrand('risk-evaluator', 'RecoveryOpsPluginId'), name: withBrand('risk-evaluator', 'RecoveryOpsPluginName') },
  { id: withBrand('command-router', 'RecoveryOpsPluginId'), name: withBrand('command-router', 'RecoveryOpsPluginName') },
];

const availablePlugins: readonly AnyGraphPlugin[] = [
  makePlugin('signal-ingest', 'signal-ingest', 'ingest'),
  makePlugin('run-planner', 'run-planner', 'plan', ['signal-ingest']),
  makePlugin('risk-evaluator', 'risk-evaluator', 'simulate', ['run-planner']),
  makePlugin('command-router', 'command-router', 'execute', ['risk-evaluator']),
];

const resolvePluginOrder = (pluginIds: readonly string[]): readonly AnyGraphPlugin[] => {
  const selected = new Set(pluginIds);
  return availablePlugins.filter((plugin) => selected.has(plugin.id as string));
};

const createWorkflow = (tenantId: string, incidentId: string, runId: string): RecoveryWorkflow => ({
  id: withBrand(`${tenantId}:workflow:${incidentId}`, 'WorkflowId'),
  tenantId: withBrand(tenantId, 'TenantId'),
  incidentId: withBrand(incidentId, 'IncidentId'),
  runId: withBrand(runId, 'RunId'),
  graphLabel: `${tenantId}::${incidentId}`,
  stages: ['ingest', 'plan', 'simulate', 'execute', 'observe', 'finalize'],
  signals: [],
  targetWindowMinutes: 30,
  tags: ['app', tenantId, incidentId],
});

const toRows = (summaries: readonly PluginExecutionSummary[]): readonly WorkspaceRow[] =>
  summaries.map((summary, index) => ({
    pluginId: summary.pluginId as string,
    stage: summary.metrics[0]?.metric ?? `plugin-${index}`,
    status: index === 0 ? 'running' : 'complete',
    score: summary.metrics.reduce((acc, metric) => acc + metric.value, 0),
  }));

const toSignals = (pluginOutputs: Record<string, readonly WorkspacePluginResult[]>): readonly PluginSignalPayload[] =>
  Object.entries(pluginOutputs).flatMap(([, snapshots]) =>
    snapshots.flatMap((snapshot) =>
      snapshot.records.map((record) => ({
        id: `${snapshot.pluginId}:${record.pluginId}`,
        label: `${record.pluginName}`,
        severity: record.outputCount,
        at: record.producedAt,
        values: [record.averagePayload],
      })),
    ),
  );

export const useRecoveryOpsGraphWorkspace = (tenantId: string, incidentId: string) => {
  const defaultProfile = getProfile('tenant-primary:v1');
  const workspaceId = `${tenantId}:graph-workspace:${incidentId}`;

  const [running, setRunning] = useState(false);
  const [runCount, setRunCount] = useState(0);
  const [selectedProfile, setSelectedProfile] = useState<ProfileId>(defaultProfile.profileId);
  const [selectedPluginIds, setSelectedPluginIds] = useState<readonly string[]>(pluginCatalog.map((plugin) => plugin.id as string));
  const [rows, setRows] = useState<readonly WorkspaceRow[]>([]);
  const [signals, setSignals] = useState<readonly PluginSignalPayload[]>([]);
  const [diagnostics, setDiagnostics] = useState<readonly PluginExecutionSummary[]>([]);

  const workflow = useMemo(() => createWorkflow(tenantId, incidentId, `${workspaceId}:run:${runCount}`), [incidentId, tenantId, runCount, workspaceId]);
  const selectedPlugins = useMemo(() => resolvePluginOrder(selectedPluginIds), [selectedPluginIds]);

  const runWorkspace = useCallback(async () => {
    setRunning(true);
    try {
      const input: OrchestratorInput = {
        workflow,
        requestedPlugins: selectedPlugins.map((plugin) => plugin.id),
        limit: selectedPlugins.length,
        allowParallel: selectedPlugins.length > 2,
        profile: getProfile(selectedProfile as string),
      };

      const result = await runWorkspaceOrchestration(selectedPlugins, input, { trace: true, dryRun: false });
      setRunCount((count) => count + 1);
      setRows((previous) => [...toRows(result.summaries), ...previous].slice(0, 30));
      setSignals(toSignals(result.pluginOutputs as Record<string, readonly WorkspacePluginResult[]>));
      setDiagnostics(result.summaries);
    } finally {
      setRunning(false);
    }
  }, [workflow, selectedPlugins, selectedProfile]);

  const togglePlugin = useCallback((pluginId: string) => {
    setSelectedPluginIds((previous) =>
      previous.includes(pluginId) ? previous.filter((entry) => entry !== pluginId) : [...previous, pluginId],
    );
  }, []);

  const reset = useCallback(async () => {
    const runner = createOrchestratorRunner<readonly AnyGraphPlugin[]>();
    setRows([]);
    setSignals([]);
    setDiagnostics([]);
    setRunCount(0);

    await runner.runWorkspace(
      {
        workspaceId,
        tenantId,
        incidentId,
        profileId: selectedProfile,
      },
      selectedProfile,
      [...selectedPlugins] as readonly AnyGraphPlugin[],
    );
  }, [incidentId, selectedPlugins, selectedProfile, tenantId, workspaceId]);

  const workspace = useMemo<GraphLabWorkspaceState>(
    () => ({
      workspaceId,
      tenantId,
      incidentId,
      profileId: selectedProfile,
      rows,
      signals,
      running,
      runCount,
      diagnostics,
      selectedPluginIds,
    }),
    [workspaceId, tenantId, incidentId, selectedProfile, rows, signals, running, runCount, diagnostics, selectedPluginIds],
  );

  useEffect(() => {
    void planAndRun(
      {
        workspaceId,
        tenantId,
        incidentId,
        profileId: selectedProfile,
      },
      [...selectedPlugins] as readonly AnyGraphPlugin[],
      selectedProfile as string,
    ).catch(() => undefined);
  }, [workspaceId, tenantId, incidentId, selectedPlugins, selectedProfile]);

  return {
    workspace,
    pluginCatalog,
    runWorkspace,
    togglePlugin,
    setProfile: setSelectedProfile,
    reset,
  };
};
