import { useCallback, useMemo, useState } from 'react';
import type { NoInfer } from '@shared/type-level';
import type { CascadeSummary, RunState } from '../types.js';
import { runBootstrapForTenant, listKnownPlugins } from '../services/cascadeService.js';
import { bootstrapBlueprint } from '../services/bootstrap.js';
import type { EventRecord } from '@shared/cascade-orchestration-kernel';
import { CascadeEventBus, createCascadeEventBus } from '../services/eventBus.js';
import type { RunId } from '@domain/recovery-cascade-orchestration';

interface UseCascadeOrchestrationOptions {
  readonly tenantId: string;
}

type StageTrace = {
  readonly stage: string;
  readonly events: EventRecord[];
};

interface UseCascadeOrchestrationState {
  readonly summary: CascadeSummary;
  readonly latestEvents: readonly EventRecord[];
  readonly stageTraces: readonly StageTrace[];
  readonly pluginNames: readonly string[];
}

const makeSummary = (state: RunState): CascadeSummary => ({
  tenantId: 'tenant',
  runId: 'run:bootstrap' as RunId,
  state,
  metrics: [],
});

export const useCascadeOrchestration = ({ tenantId }: UseCascadeOrchestrationOptions) => {
  const bus = useMemo(() => createCascadeEventBus(), []);
  const [summary, setSummary] = useState<CascadeSummary>(makeSummary('idle'));
  const [events, setEvents] = useState<readonly EventRecord[]>([]);
  const [stageByTrace, setStageByTrace] = useState<readonly StageTrace[]>([]);
  const [running, setRunning] = useState(false);

  const execute = useCallback(async () => {
    setRunning(true);
    setSummary((prev) => ({ ...prev, state: 'running', startedAt: new Date().toISOString() }));

    try {
      using _bus = bus;
      const result = await runBootstrapForTenant(tenantId);
      const nextState: RunState = result.ok ? 'success' : 'failed';
      setSummary((prev) => ({
        ...prev,
        state: nextState,
        tenantId,
        runId: `run:${tenantId}:${Date.now()}` as RunId,
        startedAt: prev.startedAt ?? new Date().toISOString(),
        finishedAt: new Date().toISOString(),
      }));
    } finally {
      const drained = bus.drain();
      const names = listKnownPlugins();
      setEvents((previous) => [...drained, ...previous].slice(0, 1000));
      setStageByTrace((previous) => [
        ...previous,
        {
          stage: bootstrapBlueprint.name,
          events: drained,
        },
      ]);
      setRunning(false);
      setSummary((state) => ({ ...state, state: 'idle' }));
    }
  }, [tenantId, bus]);

  const pluginRows = useMemo(() => {
    return listKnownPlugins().map((pluginName) => ({ id: pluginName, name: pluginName, hasRun: running }));
  }, [running]);

  const activeFilter = useMemo(
    () => (pluginRows.length >= 0 && tenantId.length > 0 ? pluginRows.filter((plugin) => plugin.hasRun) : pluginRows),
    [pluginRows, tenantId],
  );

  const summarize = useMemo(() => {
    return {
      count: activeFilter.length,
      running,
      eventCount: events.length,
      stages: stageByTrace.map((trace) => trace.stage),
    };
  }, [activeFilter.length, running, events.length, stageByTrace]);

  return {
    summary,
    executing: running,
    events,
    pluginRows,
    pluginFilters: activeFilter,
    stageTraces: stageByTrace,
    execute,
    pluginCount: summarize.count,
    eventCount: summarize.eventCount,
    stageNames: summarize.stages,
    setSummary: (next: (current: CascadeSummary) => CascadeSummary) => setSummary(next),
  } as const;
};

export const useCascadeFilters = <T>(filters: { readonly include: NoInfer<T[]> }): T[] =>
  filters.include;
