import { useCallback, useEffect, useMemo, useState } from 'react';
import { asChronicleGraphRunId, asChronicleGraphRoute, asChronicleGraphTenantId, type ChronicleGraphPhase } from '@domain/recovery-chronicle-graph-core';
import { createSession, type GraphSessionState, type GraphSessionInput } from '@service/recovery-chronicle-graph-orchestrator';
import { normalizeGraphScenario } from '../components/chronicle-graph/graph-utils';

export interface ChronoGraphSessionHook {
  readonly state: GraphSessionState;
  readonly isActive: boolean;
  readonly run: () => Promise<void>;
  readonly stop: () => Promise<void>;
}

export const useChronicleGraphSession = (
  tenant: string,
  route: string,
  phases: readonly ChronicleGraphPhase<string>[],
): ChronoGraphSessionHook => {
  const tenantId = asChronicleGraphTenantId(tenant);
  const routeId = asChronicleGraphRoute(route);
  const [state, setState] = useState<GraphSessionState>(() => {
    return {
      runId: asChronicleGraphRunId(tenantId, routeId),
      tenant: tenantId,
      route: routeId,
      startedAt: Date.now(),
      active: false,
    };
  });
  const [isActive, setIsActive] = useState(false);

  const scenario = useMemo(() => normalizeGraphScenario(tenantId, routeId, phases), [tenantId, routeId, phases]);

  const run = useCallback(async () => {
    const sessionInput: GraphSessionInput = {
      tenant: tenantId,
      route: routeId,
      scenario: scenario.scenario,
      plugins: [],
      mode: 'balanced',
    };

    const session = createSession(sessionInput);
    setIsActive(true);
    setState((current) => ({
      ...current,
      active: true,
    }));

    const stack = new AsyncDisposableStack();
    stack.defer(async () => {
      setIsActive(false);
      setState((current) => ({
        ...current,
        active: false,
      }));
      await session.close();
    });

    try {
      await using _scope = stack;
      await session.run();
    } catch (error) {
      void error;
    }
  }, [routeId, scenario, tenantId]);

  const stop = useCallback(async () => {
    setIsActive(false);
    setState((current) => ({
      ...current,
      active: false,
    }));
  }, []);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return {
    state,
    isActive,
    run,
    stop,
  };
};
