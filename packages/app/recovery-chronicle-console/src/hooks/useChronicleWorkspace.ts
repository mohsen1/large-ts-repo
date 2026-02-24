import { useCallback, useEffect, useMemo, useState } from 'react';
import { asChronicleRoute, asChronicleRunId, asChronicleTenantId, type ChroniclePhase } from '@domain/recovery-chronicle-core';
import { collectTimeline, type ChronicleTimelineEvent } from '@data/recovery-chronicle-store';
import { collectScenarioRun, createServiceSession, runSession } from '@service/recovery-chronicle-orchestrator';
import {
  defaultWorkspaceState,
  type ScenarioWorkspaceState,
  type TimelinePoint,
  type UseChronicleActions,
  type WorkspaceViewModel,
} from '../types';

const resolveTitle = (route: string): string => route.replace(/^chronicle:\/\//, '');

const toTimeline = (events: readonly ChronicleTimelineEvent[]): readonly string[] =>
  events.map((event) => `${event.sequence}: ${event.payload.value}`);

export const useChronicleWorkspace = (
  tenant: string,
  route: string,
  phases: readonly ChroniclePhase<string>[],
): [ScenarioWorkspaceState, WorkspaceViewModel, UseChronicleActions] => {
  const tenantId = asChronicleTenantId(tenant);
  const routeId = asChronicleRoute(route);
  const [state, setState] = useState<ScenarioWorkspaceState>(defaultWorkspaceState);
  const [timeline, setTimeline] = useState<readonly string[]>([]);
  const [phasesState, setPhasesState] = useState<readonly string[]>(phases);

  const viewModel: WorkspaceViewModel = useMemo(() => {
    return {
      planId: state.runId ? (`plan:${route}` as WorkspaceViewModel['planId']) : null,
      tenant: tenantId,
      route: routeId,
      title: resolveTitle(route),
      phases: phasesState,
      timeline,
    };
  }, [route, state.runId, phasesState, timeline, tenantId]);

  const refresh = useCallback(async () => {
    const result = await collectTimeline({ tenant: tenantId, route: routeId }, { maxItems: 12 });
    if (!result.ok) {
      setState((current) => ({
        ...current,
        status: 'degraded',
        errors: [...current.errors, result.error.message],
      }));
      return;
    }
    setTimeline(toTimeline(result.value));
  }, [route, tenantId]);

  const run = useCallback(async () => {
    const adapter = createServiceSession({
      tenant: tenantId,
      route: routeId,
      scenarioName: resolveTitle(route),
    });

    setState((current) => ({
      ...current,
      status: 'running',
      warnings: [],
    }));

    const result = await runSession({
      tenant: tenantId,
      route: routeId,
      scenarioName: resolveTitle(route),
    });

    if (!result.ok) {
      setState((current) => ({
        ...current,
        status: 'failed',
        errors: [...current.errors, result.error.message],
      }));
      return;
    }

    const scenarioRun = await collectScenarioRun(resolveTitle(route));
    if (!scenarioRun.ok) {
      setState((current) => ({
        ...current,
        status: 'failed',
        errors: [...current.errors, scenarioRun.error.message],
      }));
      return;
    }

    setState((current) => ({
      ...current,
      route: routeId,
      runId: scenarioRun.value.runId,
      status: scenarioRun.value.status,
      score: scenarioRun.value.metrics.score,
      phases: scenarioRun.value.metrics.phases === 0 ? phasesState : phasesState,
    }));

    await using _cleanup = {
      [Symbol.dispose]() {
        void adapter.close();
      },
    };

    await refresh();
  }, [route, tenantId, phasesState, refresh]);

  const reset = useCallback(() => {
    setState(defaultWorkspaceState);
    setTimeline([]);
    setPhasesState([...phases]);
  }, [phases]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return [
    state,
    viewModel,
    {
      refresh,
      run,
      reset,
    },
  ];
};
