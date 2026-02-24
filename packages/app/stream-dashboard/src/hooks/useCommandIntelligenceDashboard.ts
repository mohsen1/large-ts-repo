import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  asCommandEnvelopeId,
  asCommandPolicyId,
  asSignalBus,
  asCommandTag,
  asCommandTraceId,
  CommandPlan,
  CommandPlanId,
  CommandPolicy,
  CommandSignalEnvelope,
  commandNamespaces,
} from '@domain/streaming-command-intelligence';
import { runDashboardIntelligence, buildPlanFromDefaults, commandSchemaDefaults } from '../services/commandIntelligenceService';

interface EnvelopeState {
  readonly streamId: string;
  readonly namespaces: readonly string[];
}

interface RunState {
  readonly loading: boolean;
  readonly runId: CommandPlanId | null;
  readonly status: 'queued' | 'running' | 'succeeded' | 'failed' | 'suppressed' | null;
  readonly namespaces: readonly string[];
  readonly summary: Record<string, number>;
  readonly errors: readonly string[];
  readonly runCount: number;
}

const blankState = (): RunState => ({
  loading: false,
  runId: null,
  status: null,
  namespaces: [],
  summary: {},
  errors: [],
  runCount: 0,
});

const planToEnvelopeTrace = (plan: CommandPlan): readonly CommandSignalEnvelope[] =>
  plan.plugins.map((plugin, index) => ({
    tenantId: plan.tenantId,
    streamId: plan.streamId,
    namespace: plugin.namespace,
    envelopeId: asCommandEnvelopeId(`${plan.planId}:${index}`),
    traceId: asCommandTraceId(`trace:${plan.planId}:${index}`),
    pluginKind: `${plugin.namespace}-plugin`,
    tags: [asCommandTag(`step.${plugin.stepId}`), asCommandTag(`namespace.${plugin.namespace}`)],
    seenAt: new Date().toISOString(),
    payload: {
      plugin,
      pluginIndex: index,
      planType: 'default',
    },
    context: {
      pluginId: plugin.pluginId,
      pluginName: plugin.name,
      latencyMs: 0,
      status: 'queued',
      runId: plan.planId,
      message: 'hook-preview',
    },
    signals: [],
    metadata: {
      source: 'dashboard-hook',
      catalog: `preview:${plan.plugins.length}`,
      stepIndex: index,
    },
  }));

const summarizeNamespaces = (entries: readonly EnvelopeState[]): Record<string, number> =>
  entries
    .flatMap((entry) => entry.namespaces)
    .reduce<Record<string, number>>((acc, namespace) => {
      acc[namespace] = (acc[namespace] ?? 0) + 1;
      return acc;
    }, {});

const buildDefaultPolicy = (tenantId: string): CommandPolicy => ({
  id: asCommandPolicyId(`policy:${tenantId}:dashboard`),
  name: 'dashboard-policy',
  priority: 5,
  tags: ['dashboard', 'default', 'ui'],
  allowedNamespaces: [...commandNamespaces],
  requires: [asCommandTag('signal.bootstrap'), asCommandTag('signal.preview')],
  emits: [asSignalBus('commands'), asSignalBus('commands.result')],
  metadata: {
    source: 'dashboard-hook',
    tenant: tenantId,
  },
});

export interface UseCommandIntelligenceDashboardOptions {
  readonly tenantId: string;
  readonly streamId: string;
  readonly autoRun?: boolean;
}

export const useCommandIntelligenceDashboard = ({
  tenantId,
  streamId,
  autoRun = false,
}: UseCommandIntelligenceDashboardOptions) => {
  const [state, setState] = useState<RunState>(() => blankState());
  const [envelopes, setEnvelopes] = useState<readonly CommandSignalEnvelope[]>([]);

  const policy = useMemo<CommandPolicy>(() => buildDefaultPolicy(tenantId), [tenantId]);

  const namespacedSummary = useMemo(() => {
    const entries = envelopes.map((envelope) => ({
      streamId: envelope.streamId,
      namespaces: [envelope.namespace],
    }));
    return summarizeNamespaces(entries);
  }, [envelopes]);
  const namespaceList = useMemo(() => Object.keys(namespacedSummary), [namespacedSummary]);

  const execute = useCallback(async () => {
    setState((current) => ({ ...current, loading: true, errors: [] }));

    const plan = buildPlanFromDefaults(tenantId, streamId);
    const preview = planToEnvelopeTrace(plan);

    void commandSchemaDefaults({
      streamId,
      requestedAt: new Date().toISOString(),
      mode: 'toggle',
      version: 'plan-preview',
    });

    const result = await runDashboardIntelligence(plan);
    if (!result.ok) {
      setState((current) => ({
        ...current,
        loading: false,
        errors: [result.error.message],
        runCount: current.runCount + 1,
      }));
      return;
    }

    setEnvelopes(preview);
    setState((current) => ({
      ...current,
      loading: false,
      status: result.value.status,
      runId: result.value.runId,
      runCount: current.runCount + 1,
      namespaces: namespaceList,
      summary: namespacedSummary,
    }));

  }, [tenantId, streamId, policy, namespacedSummary, namespaceList]);

  useEffect(() => {
    if (autoRun) {
      void execute();
    }
  }, [autoRun, execute]);

  return {
    ...state,
    namespaces: namespaceList,
    envelopes,
    execute,
    canRun: !state.loading,
    summarizeCount: envelopes.length,
    namespaceCounts: namespacedSummary,
  };
};
