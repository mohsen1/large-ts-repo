import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CampaignTemplateOptions,
  type CampaignTemplateRequest,
  type CampaignRunResult,
  asCampaignId,
  type TenantId,
  type WorkspaceId,
} from '@domain/fault-intel-orchestration';
import { CampaignExecutor } from '@service/fault-intel-orchestrator';
import {
  createHubEnvelope,
  createHubLayerUnion,
  normalizeHubSeed,
  type HubEnvelope,
  type HubLayerSeed,
} from '@shared/type-level-hub';

interface RouteOrchestratorStats {
  readonly stage: string;
  readonly count: number;
  readonly elapsedMs: number;
}

interface UseRouteOrchestratorOptions {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly phases: readonly ['intake', 'triage', 'remediation', 'recovery'];
}

export interface UseRouteOrchestratorState {
  readonly mode: 'idle' | 'running' | 'complete' | 'error';
  readonly runSignature: string | undefined;
  readonly error: string | undefined;
  readonly runResult: CampaignRunResult | undefined;
  readonly routeCount: number;
  readonly stats: RouteOrchestratorStats;
}

const seedOptions: CampaignTemplateOptions = {
  enforcePolicy: true,
  includeAllSignals: true,
  maxSignals: 220,
};

const toRequest = (
  tenantId: TenantId,
  workspaceId: WorkspaceId,
): CampaignTemplateRequest<readonly ['intake', 'triage', 'remediation', 'recovery']> => ({
  tenantId,
  workspaceId,
  phases: ['intake', 'triage', 'remediation', 'recovery'],
  campaignSeed: `${tenantId}-${workspaceId}-control-plane`,
  owner: 'console-orchestrator',
});

const routeHubSeed = (request: CampaignTemplateRequest<readonly ['intake', 'triage', 'remediation', 'recovery']>): HubLayerSeed => ({
  catalog: request.phases,
  status: ['idle', 'running', 'escalating', 'resolved', 'blocked'],
  nodes: [
    { id: `node-${request.phases[0]}`, mode: 'orchestrate', status: 'running', rank: 0 },
    { id: `node-${request.phases[1]}`, mode: 'simulate', status: 'idle', rank: 1 },
    { id: `node-${request.phases[2]}`, mode: 'validate', status: 'idle', rank: 2 },
    { id: `node-${request.phases[3]}`, mode: 'throttle', status: 'idle', rank: 3 },
  ],
});

  const summarizeByMode = (seed: HubLayerSeed): readonly HubEnvelope<'orchestrate', 'idle', HubLayerSeed>[] => {
  return seed.nodes.map((node) =>
    createHubEnvelope('orchestrate', 'idle', seed),
  ) as readonly HubEnvelope<'orchestrate', 'idle', HubLayerSeed>[];
};

export const useFaultIntelRouteOrchestrator = ({ tenantId, workspaceId, phases }: UseRouteOrchestratorOptions) => {
  const [mode, setMode] = useState<UseRouteOrchestratorState['mode']>('idle');
  const [error, setError] = useState<string>();
  const [runResult, setRunResult] = useState<CampaignRunResult>();
  const [routeCount, setRouteCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  const request = useMemo(() => toRequest(tenantId, workspaceId), [tenantId, workspaceId]);
  const seed = useMemo(() => routeHubSeed(request), [request]);
  const layerProjection = useMemo(() => normalizeHubSeed(seed), [seed]);
  const envelopeSummary = useMemo(() => summarizeByMode(seed), [seed]);

  const buildTimeline = useCallback((run: CampaignRunResult): RouteOrchestratorStats => {
    const byTransport = run.signals.reduce<Record<string, number>>((acc, signal) => {
      acc[signal.transport] = (acc[signal.transport] ?? 0) + 1;
      return acc;
    }, { mesh: 0, fabric: 0, cockpit: 0, orchestration: 0, console: 0 });
    const transportLoad = Object.entries(byTransport)
      .sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'mesh';
    return {
      stage: `${run.policy.name}->${transportLoad}`,
      count: run.signals.length,
      elapsedMs: byTransport.mesh + byTransport.fabric,
    };
  }, []);

  const runOrchestrator = useCallback(async () => {
    setMode('running');
    setError(undefined);

    const start = performance.now();
    const executor = new CampaignExecutor();
    const layer = createHubLayerUnion(seed);

    try {
      const AsyncStack = globalThis.AsyncDisposableStack;
      if (!AsyncStack) {
        throw new Error('AsyncDisposableStack unavailable');
      }
      await using scope = new AsyncStack();
      const envelopes = envelopeSummary;
      for (const envelope of envelopes) {
        void envelope.signature;
      }
      scope.defer(async () => {
        void Promise.resolve();
      });
      const command = {
        tenantId,
        workspaceId,
        campaignId: asCampaignId(`${tenantId}:${workspaceId}:${request.phases.join('.')}` as string),
        phases,
        request,
      };
      const result = await executor.execute(command, {
        preferredTemplate: 'default-cockpit',
        signalLimit: 60,
        includeSynthetic: true,
      });

      if (!result.ok) {
        setMode('error');
        setError(result.error.message);
        return;
      }
      const duration = performance.now() - start;
      setElapsedMs(duration);
      setRunResult(result.value.run);
      setRouteCount(result.value.run.signals.length);
      setMode('complete');
    } catch (runError) {
      setMode('error');
      setError(runError instanceof Error ? runError.message : 'Execution failed');
    }
  }, [phases, request, seed, tenantId, workspaceId, envelopeSummary]);

  useEffect(() => {
    void layerProjection;
  }, [layerProjection]);

  return {
    state: {
      mode,
      runSignature: runResult?.planId,
      error,
      runResult,
      routeCount,
      stats: {
        stage: runResult?.campaign.name ?? 'none',
        count: routeCount,
        elapsedMs,
      },
    } as const satisfies UseRouteOrchestratorState,
    runOrchestrator,
    phaseCatalog: layerProjection.routes,
  };
};
