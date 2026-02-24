import { useCallback, useMemo, useState } from 'react';
import {
  type IncidentIntentDispatcher,
  type OrchestratorHandle,
  createDispatcherHandle,
} from '@service/recovery-incident-intent-orchestrator';
import {
  executeOrchestration,
  type OrchestrationInput,
  type OrchestrationOutput,
  type IncidentIntentPolicy,
  type IncidentIntentSignal,
  type IncidentContext,
  createIncidentTenantId,
} from '@domain/recovery-incident-intent';

export interface IncidentIntentOrchestratorState {
  readonly running: boolean;
  readonly loading: boolean;
  readonly tenant: string;
  readonly lastOutput: OrchestrationOutput | null;
  readonly errors: readonly string[];
  readonly runCount: number;
}

const defaultSignals = (tenant: string): readonly IncidentIntentSignal[] =>
  [
    {
      id: `bootstrap-${tenant}` as IncidentIntentSignal['id'],
      kind: 'telemetry',
      source: 'console-ui',
      value: 0.87,
      unit: 'ratio',
      observedAt: new Date().toISOString(),
      labels: {
        source: 'ui-bootstrap',
        channel: 'intent',
      },
    },
  ];

const basePolicies: readonly IncidentIntentPolicy[] = [
  {
    policyId: 'bootstrap-policy' as IncidentIntentPolicy['policyId'],
    title: 'bootstrap-resilience',
    minimumConfidence: 0.7,
    weight: {
      severity: 1.2,
      freshness: 1,
      confidence: 1.8,
      cost: 0.6,
    },
    tags: ['bootstrap', 'default'],
  },
];

export const useIncidentIntentOrchestrator = (tenantId: string) => {
  const tenant = createIncidentTenantId(tenantId);
  const [state, setState] = useState<IncidentIntentOrchestratorState>({
    running: false,
    loading: false,
    tenant,
    lastOutput: null,
    errors: [],
    runCount: 0,
  });

  const dispatcher = useMemo<OrchestratorHandle>(() => createDispatcherHandle(tenant), [tenant]);

  const setLoading = useCallback((loading: boolean): void => {
    setState((current) => ({
      ...current,
      loading,
      running: loading,
    }));
  }, []);

  const setOutput = useCallback((output: OrchestrationOutput): void => {
    setState((current) => ({
      ...current,
      lastOutput: output,
      runCount: current.runCount + 1,
      loading: false,
      running: false,
    }));
  }, []);

  const setError = useCallback((message: string): void => {
    setState((current) => ({
      ...current,
      loading: false,
      running: false,
      errors: [...current.errors, message].toSpliced(5),
    }));
  }, []);

  const execute = useCallback(async (): Promise<void> => {
    setLoading(true);
    const context = {
      tenantId: tenant,
      incidentId: `incident-${tenant}`,
      startedAt: new Date().toISOString(),
      affectedSystems: ['api-gateway', 'auth-service'],
      severity: 'p2',
      tags: ['bootstrap', 'incident-intent'],
      meta: {
        tenantId: tenant,
        owner: 'ops',
        region: 'us-east-1',
        team: 'recovery',
      },
    } satisfies IncidentContext;

    const dispatcherInput: OrchestrationInput = {
      tenantId: tenant,
      context,
      signals: [...defaultSignals(tenant)],
      policies: [...basePolicies],
      window: {
        from: new Date(Date.now() - 30_000).toISOString(),
        to: new Date().toISOString(),
      },
    };

    const result = await dispatcher.execute(dispatcherInput);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }

    setOutput(result.value);
  }, [dispatcher, tenant, setError, setLoading, setOutput]);

  const bootstrap = useCallback(async (): Promise<void> => {
    const fallback = await executeOrchestration(tenant);
    if (!fallback) return;
    setOutput(fallback);
  }, [tenant, setOutput]);

  const clearErrors = useCallback(() => {
    setState((current) => ({
      ...current,
      errors: [],
    }));
  }, []);

  const sortedSignals = useMemo(
    () =>
      [...defaultSignals(tenant)]
        .toSorted((left, right) => right.observedAt.localeCompare(left.observedAt))
        .map((signal) => ({
          ...signal,
          value: Number(signal.value.toFixed(4)),
        })),
    [tenant],
  );

  const hasHistory = state.lastOutput !== null;

  return {
    tenant,
    state,
    sortedSignals,
    execute,
    bootstrap,
    clearErrors,
    hasHistory,
  };
};
