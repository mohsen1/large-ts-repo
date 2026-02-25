import { useCallback, useEffect, useState } from 'react';
import {
  bootstrapStudioConductor,
  type PluginId,
  type StudioManifestCatalog,
  type StudioRunOutput,
} from '@shared/cockpit-studio-core';
import {
  listManifestPlugins,
  preloadManifest,
  type StudioManifestWindow,
  runStudioScenario,
  toManifestWindow,
} from '../services/studioDirectorService';

export type ConductorState = {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly manifest?: StudioManifestCatalog;
  readonly pluginIds: readonly PluginId[];
  readonly selectedPluginId: PluginId | undefined;
  readonly runHistory: readonly StudioRunOutput[];
  readonly ready: boolean;
  readonly running: boolean;
  readonly page: number;
  readonly events: number;
};

export type ConductorOps = {
  bootstrap(): Promise<void>;
  triggerRun(scenario: string, payload: Record<string, unknown>): Promise<void>;
  selectPlugin(pluginId: PluginId | undefined): void;
  clearHistory(): void;
  selectPage(page: number): void;
};

const fallbackManifest: StudioManifestWindow = {
  tenantId: 'tenant:alpha-1' as never,
  workspaceId: 'workspace:alpha-1' as never,
  pluginCount: 0,
  pluginIds: [],
  stageWeights: {},
};

const toWindow = (tenantId: string, workspaceId: string): StudioManifestWindow =>
  ({ ...fallbackManifest, tenantId: tenantId as never, workspaceId: workspaceId as never }) as StudioManifestWindow;

export const useStudioConductor = (
  initialTenantId: string = 'tenant:alpha-1',
  initialWorkspaceId: string = 'workspace:alpha-1',
): ConductorState & ConductorOps => {
  const [tenantId, setTenantId] = useState(initialTenantId);
  const [workspaceId, setWorkspaceId] = useState(initialWorkspaceId);
  const [manifest, setManifest] = useState<StudioManifestCatalog | undefined>(undefined);
  const [pluginIds, setPluginIds] = useState<readonly PluginId[]>([]);
  const [selectedPluginId, setSelectedPluginId] = useState<PluginId | undefined>(undefined);
  const [runHistory, setRunHistory] = useState<readonly StudioRunOutput[]>([]);
  const [ready, setReady] = useState(false);
  const [running, setRunning] = useState(false);
  const [page, setPage] = useState(0);
  const [events, setEvents] = useState(0);

  const bootstrap = useCallback(async () => {
    const [windowSummary] = await listManifestPlugins(tenantId, workspaceId);
    const summary = windowSummary ?? toWindow(tenantId, workspaceId);
    const resolvedCatalog = summary.tenantId && summary.workspaceId
      ? await preloadManifest(summary.tenantId, summary.workspaceId)
      : await preloadManifest(tenantId, workspaceId);

    const conductor = await bootstrapStudioConductor(summary.tenantId as string, summary.workspaceId as string);
    setPluginIds(conductor.pluginIds);
    setManifest(resolvedCatalog);
    setReady(true);
  }, [tenantId, workspaceId]);

  const triggerRun = useCallback(
    async (scenario: string, payload: Record<string, unknown>) => {
      setRunning(true);
      try {
        const runOutput = await runStudioScenario(tenantId, workspaceId, scenario, payload);
        setRunHistory((current) => [...current.slice(-19), runOutput.output]);
        setEvents((value) => value + runOutput.output.events.length);
      } finally {
        setRunning(false);
      }
    },
    [tenantId, workspaceId],
  );

  const clearHistory = useCallback(() => {
    setRunHistory([]);
    setEvents(0);
    setPage(0);
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    setTenantId(initialTenantId);
  }, [initialTenantId]);

  useEffect(() => {
    setWorkspaceId(initialWorkspaceId);
  }, [initialWorkspaceId]);

  return {
    tenantId,
    workspaceId,
    manifest,
    pluginIds,
    selectedPluginId,
    runHistory,
    ready,
    running,
    page,
    events,
    bootstrap,
    triggerRun,
    selectPlugin(pluginId) {
      setSelectedPluginId(pluginId);
    },
    clearHistory,
    selectPage: setPage,
  };
};
