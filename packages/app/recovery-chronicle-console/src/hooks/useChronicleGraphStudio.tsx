import { useCallback, useEffect, useMemo, useState } from 'react';
import { type ChronicleRunId, type ChronicleRoute } from '@domain/recovery-chronicle-core';
import {
  asChronicleGraphPhase,
  asChronicleGraphRoute,
  asChronicleGraphTenantId,
  type ChronicleGraphPhase,
  type ChronicleGraphStatus,
} from '@domain/recovery-chronicle-graph-core';
import {
  type GraphWorkspaceState,
  type GraphWorkspaceResult,
  collectGraphWorkspaces,
  runOrchestrator,
  createSession,
} from '@service/recovery-chronicle-graph-orchestrator';
import {
  defaultWorkspaceState,
  type ScenarioWorkspaceState,
  type TimelinePoint,
  type UseChronicleActions,
  type WorkspaceViewModel,
  type ChronicleRouteOption,
  emptyTimeline,
} from '../types';
import { normalizeGraphScenario } from '../components/chronicle-graph/graph-utils';

interface UseChronicleGraphWorkspaceParams {
  readonly tenant: string;
  readonly route: string;
  readonly phases: readonly ChronicleGraphPhase<string>[];
}

const statusLabel = (status: ChronicleGraphStatus): ScenarioWorkspaceState['status'] => {
  switch (status) {
    case 'pending':
      return 'queued' as const;
    case 'running':
      return 'running';
    case 'completed':
      return 'succeeded';
    case 'failed':
      return 'failed';
    case 'degraded':
      return 'degraded';
    case 'cancelled':
      return 'cancelled';
    default:
      return 'idle';
  }
};

const routeOptions = (route: string, tenant: string): ChronicleRouteOption[] => {
  const safe = asChronicleGraphRoute(route);
  const tenantId = asChronicleGraphTenantId(tenant);
  return [
    {
      tenant: tenantId as unknown as ChronicleRouteOption['tenant'],
      route: safe as unknown as ChronicleRouteOption['route'],
      label: `tenant:${safe.replace('chronicle-graph://', '')}`,
    },
    {
      tenant: tenantId as unknown as ChronicleRouteOption['tenant'],
      route: asChronicleGraphRoute('policy') as unknown as ChronicleRouteOption['route'],
      label: 'policy',
    },
    {
      tenant: tenantId as unknown as ChronicleRouteOption['tenant'],
      route: asChronicleGraphRoute('timeline') as unknown as ChronicleRouteOption['route'],
      label: 'timeline',
    },
  ];
};

const resolveTimeline = (events: readonly GraphWorkspaceState[]): readonly string[] => {
  if (events.length === 0) return emptyTimeline;
  return events.map((workspace, index) => `${index + 1}:${workspace.status}:${workspace.score}`);
};

const mapWorkspaceSummary = (workspaces: readonly GraphWorkspaceState[]) =>
  workspaces.map<TimelinePoint>((state) => ({
    label: `${state.route}-${state.runId}`,
    score: state.score,
    status: (state.status === 'completed'
      ? 'succeeded'
      : state.status === 'running'
        ? 'running'
        : 'failed') as TimelinePoint['status'],
  }));

export const useChronicleGraphWorkspace = ({
  tenant,
  route,
  phases,
}: UseChronicleGraphWorkspaceParams): [ScenarioWorkspaceState, WorkspaceViewModel, UseChronicleActions, ChronicleRouteOption[]] => {
  const tenantId = asChronicleGraphTenantId(tenant);
  const routeId = asChronicleGraphRoute(route);
  const scenarioPayload = useMemo(() => normalizeGraphScenario(tenantId, routeId, phases), [tenant, route, phases]);
  const scenario = scenarioPayload.scenario;
  const scenarioPhases = useMemo(
    () => scenario.priorities.map((phase) => asChronicleGraphPhase(phase)),
    [scenario],
  );
  const [state, setState] = useState<ScenarioWorkspaceState>(defaultWorkspaceState);
  const [timeline, setTimeline] = useState<readonly string[]>(emptyTimeline);
  const [workspaces, setWorkspaces] = useState<readonly GraphWorkspaceState[]>([]);
  const [routes] = useState<readonly ChronicleRouteOption[]>(routeOptions(route, tenant));

  const viewModel = useMemo<WorkspaceViewModel>(() => {
    const runId = scenario.id as unknown as WorkspaceViewModel['planId'];
    return {
      planId: runId,
      tenant: tenantId as unknown as WorkspaceViewModel['tenant'],
      route: routeId as unknown as WorkspaceViewModel['route'],
      title: scenario.title,
      phases: scenarioPhases.map((phase) => String(phase)),
      timeline,
    };
  }, [routeId, scenario.title, scenario.id, scenarioPhases, timeline, tenantId]);

  const refresh = useCallback(async () => {
    const result = await collectGraphWorkspaces({
      tenant,
      route: routeId,
    });

    if (!result.ok) {
      setState((current) => ({
        ...current,
        status: 'degraded',
        errors: [...current.errors, String(result.error)],
      }));
      return;
    }

    setWorkspaces(result.value);
    setTimeline(resolveTimeline(result.value));
  }, [route, tenant, routeId]);

  const run = useCallback(async () => {
    const session = createSession({
      tenant: tenantId,
      route: routeId,
      scenario,
      plugins: [],
      mode: 'balanced',
    });

    setState((current) => ({
      ...current,
      status: 'running',
      warnings: [],
      phases: scenarioPhases.map((phase) => String(phase)),
    }));

    const result = await runOrchestrator(
      scenario,
      [],
      'balanced',
    );

    if (!result.ok) {
      setState((current) => ({
        ...current,
        status: 'failed',
        warnings: [],
        errors: [...current.errors, String(result.error)],
      }));
      await session.close();
      return;
    }

    const workspace = result.value.workspace;
    setState((current) => ({
      ...current,
      runId: workspace.runId as unknown as ChronicleRunId,
      status: statusLabel(workspace.status),
      score: workspace.score,
      phases: workspace.phases,
      route: route as unknown as ChronicleRoute,
      warnings: [],
    }));
    setTimeline(resolveTimeline([workspace]));

    await session.close();
  }, [route, routeId, scenario, tenantId]);

  const reset = useCallback(() => {
    setState(defaultWorkspaceState);
    setTimeline(emptyTimeline);
    setWorkspaces([]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return [
    state,
    {
      ...viewModel,
      timeline,
    },
    {
      refresh,
      run,
      reset,
    },
    [...routes],
  ];
};
