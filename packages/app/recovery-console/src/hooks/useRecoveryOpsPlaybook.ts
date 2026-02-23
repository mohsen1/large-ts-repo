import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildPlanBundle,
  executeBundle,
  listByQuery,
  type OrchestratorAdapter,
  type OrchestrationStore,
  type OrchestratorQuery,
} from '@service/recovery-ops-playbook-orchestrator';
import { analyzePlan } from '@service/recovery-ops-playbook-orchestrator';
import type { PlaybookSearchFilters, PlaybookRun } from '@domain/recovery-ops-playbook';

interface PlaybookInputs {
  blueprint: unknown;
  runbook: unknown;
}

type PanelScope = 'global' | 'regional' | 'service' | 'workload';

type PanelFilter = {
  includeDrafts: boolean;
  scope: PanelScope;
  team: string;
  maxLatencyMinutes: number;
};

const defaultAdapter: OrchestratorAdapter = {
  executeCommand: async () => ({ ok: true }),
};

const makeStore = (): OrchestrationStore => {
  const map = new Map<string, PlaybookRun>();

  return {
    async saveRun(run) {
      if (run?.id) {
        map.set(run.id, run);
      }
    },
    async saveTrace(item) {
      // intentionally no-op for this in-memory adapter
      if (item.action && item.timestamp) {
        return;
      }
    },
    async getRun(runId) {
      return map.get(runId);
    },
  };
};

export interface PlaybookState {
  readonly status: 'idle' | 'loading' | 'ready' | 'running' | 'failed';
  readonly error?: string;
  readonly snapshot?: any;
  readonly filter: PanelFilter;
  readonly runHistory: readonly Record<string, unknown>[];
}

export const useRecoveryOpsPlaybook = ({ blueprint, runbook, adapter = defaultAdapter }: PlaybookInputs & { adapter?: OrchestratorAdapter }) => {
  const [state, setState] = useState<PlaybookState>({
    status: 'idle',
    filter: {
      includeDrafts: false,
      scope: 'service',
      team: 'platform',
      maxLatencyMinutes: 120,
    },
    runHistory: [],
  });

  const store = useMemo(() => makeStore(), []);
  const [query, setQuery] = useState<{ owner: string; minConfidence: number }>({
    owner: 'platform',
    minConfidence: 0.82,
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, status: 'loading' }));
    try {
      const snapshotBundle = buildPlanBundle(blueprint, runbook);
      const analysis = analyzePlan(snapshotBundle.plan);
      if (!analysis.ok) {
        setState((prev) => ({ ...prev, status: 'failed', error: analysis.error }));
        return;
      }

      const result = await executeBundle(snapshotBundle, adapter, store);
      if (!result.ok) {
        setState((prev) => ({ ...prev, status: 'failed', error: result.error.message }));
        return;
      }

      setState((prev) => ({
        ...prev,
        status: 'ready',
        snapshot: result.value,
        runHistory: [
          ...prev.runHistory,
          {
            runId: result.value.run.id,
            playbookId: result.value.playbookId,
            updatedAt: new Date().toISOString(),
            metrics: {
              completion: analysis.value.stats.totalLatencyMs,
              traceLength: result.value.trace.length,
            },
            confidence: analysis.value.quality.normalized,
          },
        ],
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown failure',
      }));
    }
  }, [adapter, blueprint, runbook, store]);

  const runCatalog = useCallback(async () => {
    const scopeFilter: PlaybookSearchFilters['scope'] = state.filter.scope === 'regional'
      ? 'region'
      : state.filter.scope;

    const queryPayload = {
      includeDrafts: state.filter.includeDrafts,
      filters: {
        owner: state.filter.team,
        scope: scopeFilter,
      },
      priorityWindowMinutes: state.filter.maxLatencyMinutes,
      requestId: `rq-${Date.now()}` as OrchestratorQuery['requestId'],
    } satisfies OrchestratorQuery;

    try {
      const items = await listByQuery(queryPayload, store);
      setState((prev) => ({
        ...prev,
        status: 'ready',
        runHistory: items.map((item) => ({
          runId: item.id,
          owner: query.owner,
          scope: state.filter.scope,
          inspectedAt: new Date().toISOString(),
          ...item,
        })),
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        status: 'failed',
        error: error instanceof Error ? error.message : 'query failed',
      }));
    }
  }, [query.owner, state.filter.includeDrafts, state.filter.maxLatencyMinutes, state.filter.scope, state.filter.team, store]);

  const setScope = useCallback((scope: PanelScope) => {
    setState((prev) => ({ ...prev, filter: { ...prev.filter, scope } }));
  }, []);

  const setDrafts = useCallback((value: boolean) => {
    setState((prev) => ({ ...prev, filter: { ...prev.filter, includeDrafts: value } }));
  }, []);

  useEffect(() => {
    if (state.status === 'idle') {
      refresh().catch(() => undefined);
    }
  }, [refresh, state.status]);

  return {
    state,
    refresh,
    runCatalog,
    setScope,
    setDrafts,
    setQuery,
    query,
  };
};
