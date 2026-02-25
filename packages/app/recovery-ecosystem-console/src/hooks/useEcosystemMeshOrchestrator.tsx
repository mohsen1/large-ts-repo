import { useCallback, useMemo, useState } from 'react';
import { z } from 'zod';
import { type EcosystemEvent, type MeshPluginDefinition, formatRunId, type MeshRunRequest } from '@domain/recovery-ecosystem-orchestrator-core';
import { createMeshService, normalizeEvents, MeshOrchestrationService } from '../services/meshOrchestrationService';
import type { TenantId, WorkspaceId, RunId, TimelineEventId } from '@domain/recovery-ecosystem-orchestrator-core';

interface RunState<TPayload extends Record<string, unknown>> {
  readonly runId: string;
  readonly status: 'idle' | 'running' | 'succeeded' | 'failed';
  readonly lastError?: string;
  readonly output?: TPayload;
  readonly history: readonly string[];
  readonly events: readonly EcosystemEvent[];
}

interface UseEcosystemMeshResult<TPayload extends Record<string, unknown>> {
  readonly plugins: readonly { readonly name: string; readonly stage: string }[];
  readonly runState: Readonly<RunState<TPayload>>;
  readonly stageOrder: readonly string[];
  readonly snapshot: {
    readonly pluginNames: readonly string[];
    readonly stageOrder: readonly string[];
  };
  readonly run: (request: TPayload) => Promise<void>;
  readonly clear: () => void;
}

const requestSchema = z.object({
  tenantId: z.string().regex(/^tenant:/),
  workspaceId: z.string().regex(/^workspace:/),
  request: z.record(z.unknown()),
});

export const useEcosystemMeshOrchestrator = <TRequest extends Record<string, unknown>>(
  plugins: readonly MeshPluginDefinition[],
  tenantId: TenantId,
  workspaceId: WorkspaceId,
): UseEcosystemMeshResult<TRequest> => {
  const [runState, setRunState] = useState<RunState<TRequest>>({
    runId: '',
    status: 'idle',
    history: [],
    events: [],
  });

  const service = useMemo(() => createMeshService(plugins), [plugins]);

  const pluginList = useMemo(
    () => plugins.map((plugin) => ({ name: plugin.name, stage: plugin.stage })),
    [plugins],
  );

  const seedRunId = formatRunId(tenantId, workspaceId, 'atlas');
  const snapshot = useMemo(() => ({
    pluginNames: plugins.map((plugin) => plugin.name),
    stageOrder: normalizeEvents(
      plugins.map((plugin) => ({
        at: new Date().toISOString(),
        kind: 'plugin.started' as const,
        eventId: `timeline:${seedRunId}` as TimelineEventId,
        pluginId: plugin.name,
        runId: seedRunId as RunId,
        tenantId,
        workspaceId,
        stage: plugin.stage,
        inputHash: `seed:${plugin.name}`,
      })),
    ).map((event) => `${event.stage}:${event.pluginId}`),
  }), [plugins, tenantId, workspaceId, seedRunId]);

  const run = useCallback(
    async (request: TRequest) => {
      const validated = requestSchema.safeParse({
        tenantId,
        workspaceId,
        request,
      });

      if (!validated.success) {
        setRunState((current) => ({
          ...current,
          status: 'failed',
          lastError: validated.error.message,
        }));
        return;
      }

      setRunState((current) => ({
        ...current,
        status: 'running',
        history: [...current.history, `start:${Date.now()}`],
      }));

      try {
        const result = await service.runScenario<TRequest, TRequest>(validated.data.request as TRequest);
        setRunState((current) => ({
          ...current,
          status: 'succeeded',
          runId: result.runId,
          output: result.output,
          events: result.events,
          history: [
            ...current.history,
            `done:${result.pluginCount}`,
            `stages:${result.stageCount}`,
            ...Object.keys(result.diagnostics).map((item) => `diagnostic:${item}`),
          ],
        }));
      } catch (error) {
        setRunState((current) => ({
          ...current,
          status: 'failed',
          lastError: (error as Error).message,
        }));
      }
    },
    [service, tenantId, workspaceId],
  );

  const clear = useCallback(() => {
    setRunState({
      runId: '',
      status: 'idle',
      history: [],
      events: [],
    });
  }, []);

  return {
    plugins: pluginList,
    runState,
    stageOrder: snapshot.stageOrder,
    snapshot: {
      pluginNames: snapshot.pluginNames,
      stageOrder: snapshot.stageOrder,
    },
    run,
    clear,
  };
};

export interface UseEcosystemMeshOrchestratorState {
  readonly canRun: boolean;
  readonly runCount: number;
}

export const useMeshRunState = <TPlugins extends readonly MeshPluginDefinition[]>(
  plugins: TPlugins,
  service: MeshOrchestrationService,
): UseEcosystemMeshOrchestratorState => {
  const canRun = plugins.length > 0 && typeof service.getSnapshot === 'function';
  const runCount = service.getPluginRegistry().length;
  return useMemo(() => ({ canRun, runCount }), [canRun, runCount]);
};

export const normalizeRequest = (request: MeshRunRequest<Record<string, unknown>>): boolean => {
  return request.tenantId.startsWith('tenant:') && request.workspaceId.startsWith('workspace:');
};
