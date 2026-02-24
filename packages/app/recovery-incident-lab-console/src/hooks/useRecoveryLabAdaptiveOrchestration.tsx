import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  runAdaptiveCampaign,
  summarizeAdaptiveResult,
  renderDiagnosticRows,
  type AdaptiveRunResponse,
} from '../services/recoveryLabAdaptiveAutomationService';
import {
  type CampaignDiagnostic,
  type TenantId,
} from '@domain/recovery-lab-adaptive-orchestration';
import {
  collectIterable,
  mapIterable,
  collectPluginEvents,
  type PluginExecutionRecord,
  type PluginEvent,
  type PluginResult,
  type PluginId,
} from '@shared/stress-lab-runtime';

interface UseAdaptiveLabState {
  readonly scenario: string;
  readonly tenantId: TenantId;
  readonly seed: Record<string, unknown>;
  readonly mode: 'idle' | 'running' | 'completed' | 'error';
  readonly response?: AdaptiveRunResponse<Record<string, unknown>>;
  readonly diagnostics: readonly CampaignDiagnostic[];
  readonly summary: string;
  readonly eventFeed: readonly PluginEvent[];
  readonly runningSince?: string;
}

const defaultSeed = {
  region: 'us-east-1',
  service: 'recovery-orchestrator',
  priority: 'high',
  objectives: ['latency', 'integrity', 'continuity'],
  constraints: ['slo', 'cap', 'compliance'],
} satisfies Record<string, unknown>;

const toEventFeed = (diagnostics: readonly CampaignDiagnostic[]): readonly PluginEvent[] => {
  const records = collectIterable(
    mapIterable(diagnostics, (entry): PluginExecutionRecord<unknown, unknown> => {
      const metadata = {
        phase: entry.phase,
        message: entry.message,
        source: entry.source,
      } as Record<string, unknown>;

      const result: PluginResult<unknown> = {
        ok: !entry.tags.some((tag) => tag === 'error' || tag === 'fatal' || tag === 'critical'),
        value: {
          pluginId: entry.pluginId,
          phase: entry.phase,
          message: entry.message,
        },
        errors: entry.tags.includes('error') || entry.tags.includes('fatal') || entry.tags.includes('critical')
          ? ['runtime-failure']
          : undefined,
        generatedAt: entry.at,
      };

      return {
        pluginId: entry.pluginId as unknown as PluginId,
        startedAt: entry.at,
        finishedAt: new Date(entry.at).toISOString(),
        input: metadata,
        output: result,
      };
    }),
  );

  return collectPluginEvents(records).map((entry) => ({
    ...entry,
    metadata: {
      ...entry.metadata,
      generated: true,
    },
  }));
};

export const useRecoveryLabAdaptiveOrchestration = () => {
  const [state, setState] = useState<UseAdaptiveLabState>({
    scenario: 'recovery-lab-smoke',
    tenantId: 'tenant:lab-automation' as TenantId,
    seed: defaultSeed,
    mode: 'idle',
    diagnostics: [],
    summary: 'No run yet',
    eventFeed: [],
  });

  const inFlight = useRef<AbortController | null>(null);

  const clear = useCallback(() => {
    setState((previous) => ({
      ...previous,
      mode: 'idle',
      response: undefined,
      diagnostics: [],
      summary: 'No run yet',
      eventFeed: [],
    }));
  }, []);

  const updateSeed = useCallback((next: Record<string, unknown>) => {
    setState((previous) => ({
      ...previous,
      seed: next,
    }));
  }, []);

  const run = useCallback(async (runMode: 'simulate' | 'validate' | 'execute') => {
    const abort = new AbortController();
    inFlight.current = abort;

    setState((previous) => ({
      ...previous,
      mode: 'running',
      runningSince: new Date().toISOString(),
      summary: `starting ${runMode}`,
    }));

    try {
      const response = await runAdaptiveCampaign({
        tenantId: state.tenantId,
        scenario: state.scenario,
        seed: state.seed,
        runMode,
      });

      if (abort.signal.aborted) {
        return;
      }

      const sorted = response.diagnostics.toSorted((left, right) => {
        const phaseCompare = left.phase.localeCompare(right.phase);
        if (phaseCompare !== 0) {
          return phaseCompare;
        }
        return left.at.localeCompare(right.at);
      });

      const summary = summarizeAdaptiveResult(response);
      setState((previous) => ({
        ...previous,
        mode: 'completed',
        response,
        diagnostics: sorted,
        summary,
        eventFeed: toEventFeed(sorted),
      }));
    } catch (error) {
      if (abort.signal.aborted) {
        return;
      }

      setState((previous) => ({
        ...previous,
        mode: 'error',
        summary: error instanceof Error ? error.message : 'Run failed',
      }));
    } finally {
      inFlight.current = null;
    }
  }, [state.scenario, state.seed, state.tenantId]);

  const cancel = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setState((previous) => ({
      ...previous,
      mode: 'error',
      summary: 'Cancelled',
    }));
  }, []);

  useEffect(() => {
    const heartbeat = setInterval(() => {
      if (state.mode === 'running' && state.runningSince) {
        setState((previous) => ({
          ...previous,
          summary: `running for ${Math.round((Date.now() - Date.parse(previous.runningSince ?? '')) / 1000)}s`,
        }));
      }
    }, 250);

    return () => {
      clearInterval(heartbeat);
    };
  }, [state.mode, state.runningSince]);

  const latestSnapshot = state.response?.snapshots.at(-1);
  const eventText = useMemo(() => renderDiagnosticRows(state.diagnostics), [state.diagnostics]);
  const hasDiagnostics = state.diagnostics.length > 0;

  return {
    state,
    run,
    clear,
    cancel,
    hasDiagnostics,
    latestSnapshot,
    eventText,
    updateSeed,
  };
};
