import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ConductorWorkspace,
  createWorkspace,
  evaluateWorkspace,
  type ConductorDashboardSummary,
  type ConductorAnalyticsRun,
  type WorkspaceSnapshot,
} from '@service/recovery-lab-orchestrator';
import {
  type ForecastSummary,
  buildCompositeForecast,
  forecastSurfaceFromPlan,
  type SurfaceSignal,
  buildForecastSummary,
} from '@domain/recovery-simulation-lab-core';
import { asLabTenantId } from '@shared/recovery-lab-kernel';

type HookStatus = 'idle' | 'running' | 'ready' | 'error';

export interface RecoveryLabConductorState {
  readonly status: HookStatus;
  readonly workspace: WorkspaceSnapshot | null;
  readonly summary: ConductorDashboardSummary | null;
  readonly diagnostics: readonly string[];
  readonly forecast: ForecastSummary | null;
  readonly routeSummary: readonly string[];
}

interface UseRecoveryLabConductorOptions {
  readonly tenant: string;
  readonly workspace: string;
}

const statusLabel: Record<HookStatus, string> = {
  idle: 'ready',
  running: 'running',
  ready: 'ready',
  error: 'error',
};

const normalizeWindow = (value: string): string => value.replace(/\s+/g, '_').toLowerCase();

const createSignalSeed = (tenant: string): SurfaceSignal[] => [
  {
    name: `${normalizeWindow(`${tenant}-health`)}`,
    lane: 'simulate',
    severity: 'low',
    value: 0,
    createdAt: new Date().toISOString(),
  },
  {
    name: `${normalizeWindow(`${tenant}-risk`)}`,
    lane: 'verify',
    severity: 'medium',
    value: 1,
    createdAt: new Date().toISOString(),
  },
  {
    name: `${normalizeWindow(`${tenant}-capacity`)}`,
    lane: 'restore',
    severity: 'high',
    value: 2,
    createdAt: new Date().toISOString(),
  },
];

const uniqueLines = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
};

export const useRecoveryLabConductor = ({ tenant, workspace }: UseRecoveryLabConductorOptions): RecoveryLabConductorState & {
  readonly run: (event: string) => Promise<void>;
  readonly reload: () => Promise<void>;
} => {
  const [status, setStatus] = useState<HookStatus>('idle');
  const [workspaceState, setWorkspaceState] = useState<WorkspaceSnapshot | null>(null);
  const [summary, setSummary] = useState<ConductorDashboardSummary | null>(null);
  const [diagnostics, setDiagnostics] = useState<readonly string[]>([]);
  const [forecast, setForecast] = useState<ForecastSummary | null>(null);
  const [routeSummary, setRouteSummary] = useState<readonly string[]>([]);

  const controller = useRef<AbortController | null>(null);

  const normalizedTenant = useMemo(() => String(asLabTenantId(tenant)), [tenant]);
  const signalSeed = useMemo(() => createSignalSeed(normalizedTenant), [normalizedTenant]);

  const reload = async (): Promise<void> => {
    setStatus('running');
    try {
      const refreshed = await evaluateWorkspace(tenant, workspace, [], []);
      const workspaceContext = createWorkspace(tenant, workspace, 'simulate');
      const snapshot = await workspaceContext.bootstrap();

      const diagnosticsRun: readonly string[] = [
        `tenant:${normalizedTenant}`,
        `workspace:${workspace}`,
        `route:${snapshot.routeCount}`,
      ];

      const forecastSummary = buildForecastSummary(tenant, [], []);
      const futureForecast = await forecastSurfaceFromPlan(signalSeed);
      const composite = buildCompositeForecast(
        normalizedTenant,
        forecastSummary.topSignals.length > 0
          ? signalSeed
          : [...signalSeed, ...signalSeed.map((item) => ({
            ...item,
            name: `${item.name}-composite`,
          }))],
        [],
      );

      setWorkspaceState(snapshot);
      setSummary(refreshed);
      setForecast({
        ...composite,
        windows: [...futureForecast, ...composite.windows],
      });
      setRouteSummary(refreshed.top);
      setDiagnostics(uniqueLines(diagnosticsRun));
      setStatus('ready');
    } catch (error) {
      setDiagnostics((previous) => [...previous, `error:${error instanceof Error ? error.message : String(error)}`]);
      setStatus('error');
    }
  };

  const run = async (event: string): Promise<void> => {
    const runRef = new ConductorWorkspace({
      tenant,
      workspace,
      lanes: ['simulate', 'restore', 'verify', 'report'],
      scenarios: [],
      planTemplates: [],
    });

    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;

    if (current.signal.aborted) {
      return;
    }

    setStatus('running');
    try {
      const normalized = event.trim().toLowerCase();
      const scenarioId = normalized.includes('seed') ? `seed-${Date.now()}` : `event-${Date.now()}`;

      runRef.registerDefaultPlugins();
      const summary = await runRef.runSummary();
      const scenario = runRef.snapshot();

      const runState = {
        runId: `${scenarioId}`,
        workspace: `${runRef.snapshot().tenant}`,
        laneOrder: ['simulate', 'restore', 'verify', 'report'],
        status: 'ok' as const,
        trace: [scenario.workspace, scenario.tenant, normalized],
        routeCount: scenario.routeCount,
        routeSummary: [{ tenant, route: normalized, score: scenario.signalCount }],
      } satisfies ConductorAnalyticsRun;

      const summaryLines = [`run:${runState.runId}`, `status:${runState.status}`, `trace:${runState.trace.join('|')}`];

      setSummary((currentSummary) => ({
        ...currentSummary,
        ...summary,
        top: [...new Set([...summary.top, ...(currentSummary?.top ?? [])])],
      }));

      setRouteSummary((currentRoutes) =>
        uniqueLines([...currentRoutes, ...runState.trace, ...runState.routeSummary.map((entry) => entry.route)]),
      );
      setDiagnostics((currentDiagnostics) => uniqueLines([...currentDiagnostics, ...summaryLines]));
      setStatus('ready');
      setWorkspaceState((previousWorkspace) => previousWorkspace ?? null);
      void runState;
    } catch (error) {
      if (!current.signal.aborted) {
        setDiagnostics((currentDiagnostics) => [...currentDiagnostics, `run-error:${error instanceof Error ? error.message : String(error)}`]);
        setStatus('error');
      }
    }
  };

  useEffect(() => {
    void reload();
    return () => {
      controller.current?.abort();
      controller.current = null;
    };
  }, [tenant, workspace]);

  return {
    status,
    workspace: workspaceState,
    summary,
    diagnostics,
    forecast,
    routeSummary,
    run,
    reload,
  };
};

export const statusClass = (status: HookStatus): string => statusLabel[status];
