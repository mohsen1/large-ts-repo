import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  HorizonPlan,
  HorizonSignal,
  JsonLike,
  PluginStage,
  StageLabel,
  TimeMs,
} from '@domain/recovery-horizon-engine';
import { summarizeSignals } from '@service/recovery-horizon-orchestrator';
import type {
  HorizonStoreRecord,
  HorizonReadResult,
} from '@data/recovery-horizon-store';
import {
  type RecoveryHorizonRepository,
  createRepository,
} from '@data/recovery-horizon-store';
import {
  type SessionStageConfig,
  HorizonRunSession,
  launchHorizonSession,
} from '@service/recovery-horizon-orchestrator';
import { horizonBrand } from '@domain/recovery-horizon-engine';

interface WorkspaceSignal {
  readonly stage: PluginStage;
  readonly label: string;
  readonly count: number;
}

interface WorkspaceState {
  readonly tenantId: string;
  readonly plan?: HorizonPlan;
  readonly isBusy: boolean;
  readonly runId?: string;
  readonly signals: readonly HorizonSignal<PluginStage, JsonLike>[];
  readonly records: readonly HorizonStoreRecord[];
  readonly health: 'good' | 'warning' | 'degraded';
}

interface Snapshot {
  readonly id: string;
  readonly summary: string;
  readonly signalCount: number;
}

type Trend = readonly WorkspaceSignal[];

const defaultConfig = (tenantId: string): SessionStageConfig => ({
  tenant: tenantId,
  stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
  owner: 'recovery-horizon-ui',
  planName: `${tenantId}-lab-plan`,
  tags: ['ui', 'session', 'dashboard'],
});

const toTrend = (signals: readonly HorizonSignal<PluginStage, JsonLike>[]): Trend =>
  Array.from(
    signals.reduce<Map<PluginStage, number>>((acc, signal) => {
      acc.set(signal.kind, (acc.get(signal.kind) ?? 0) + 1);
      return acc;
    }, new Map<PluginStage, number>()).entries(),
  ).map(([stage, count]) => ({
    stage,
    label: `${stage}:${count}`,
    count,
  }));

const toPlan = (tenantId: string, stages: readonly PluginStage[], planId: string): HorizonPlan => ({
  id: horizonBrand.fromPlanId(planId),
  tenantId,
  startedAt: horizonBrand.fromTime(Date.now()) as TimeMs,
  pluginSpan: {
    stage: stages[0] ?? 'ingest',
    label: `${(stages[0] ?? 'ingest').toUpperCase()}_STAGE` as StageLabel<PluginStage>,
    startedAt: horizonBrand.fromTime(Date.now()) as TimeMs,
    durationMs: horizonBrand.fromTime(0) as TimeMs,
  },
});

export const useRecoveryHorizonOrchestrator = (tenantId = 'tenant-001') => {
  const repositoryRef = useRef<RecoveryHorizonRepository>(createRepository(tenantId));
  const [state, setState] = useState<WorkspaceState>({
    tenantId,
    isBusy: false,
    signals: [],
    records: [],
    health: 'warning',
  });
  const [snapshots, setSnapshots] = useState<readonly Snapshot[]>([]);

  const loadWindow = useCallback(async (maxRows = 150) => {
    const result = await repositoryRef.current.read({
      tenantId,
      stages: defaultConfig(tenantId).stages,
      includeArchived: false,
      maxRows,
    });
    if (!result.ok) {
      return;
    }

    const records = result.value.items;
    const signals = records.map((entry) => entry.signal);
    setState((previous) => ({
      ...previous,
      records,
      signals,
      health: signals.length > 2 ? 'good' : signals.length > 0 ? 'warning' : 'degraded',
    }));
  }, [tenantId]);

  const runPlan = useCallback(async () => {
    setState((previous) => ({ ...previous, isBusy: true }));
    const id = `plan:${tenantId}:${Date.now()}`;
    const config = defaultConfig(tenantId);
    const plan = toPlan(tenantId, config.stages, id);
    const session = new HorizonRunSession(tenantId, config.stages, config.owner, config.tags);

    try {
      const outcome = await session.run(plan);
      const queryResult = await session.query({ tenantId, includeArchived: false, maxRows: Math.max(64, config.stages.length * 10) });
      const signals = queryResult.items.map((item) => item.signal);
      const analysis = summarizeSignals(outcome.runId, signals);
      setState((previous) => ({
        ...previous,
        isBusy: false,
        plan,
        runId: String(outcome.runId),
        records: queryResult.items,
        signals,
        health: outcome.ok && analysis.ok ? 'good' : analysis.ok ? 'warning' : 'degraded',
      }));
      setSnapshots((previous) => [
        {
          id,
          summary: analysis.ok ? `signals=${analysis.value.signalCount}` : 'no-analysis',
          signalCount: signals.length,
        },
        ...previous,
      ]);
    } catch {
      setState((previous) => ({ ...previous, isBusy: false, health: 'degraded' }));
    }
  }, [tenantId]);

  const launchFromService = useCallback(async () => {
    setState((previous) => ({ ...previous, isBusy: true }));
    const response = await launchHorizonSession({
      tenant: tenantId,
      stages: defaultConfig(tenantId).stages,
      owner: defaultConfig(tenantId).owner,
      planName: `${tenantId}-service-${Date.now()}`,
      tags: defaultConfig(tenantId).tags,
    });

    if (!response.ok) {
      setState((previous) => ({ ...previous, isBusy: false, health: 'degraded' }));
      return;
    }

    await loadWindow(220);
    const latestPlan = response.value.snapshot.latest.plans.at(0);
    const latestSignals = response.value.snapshot.latest.signals;
    const latestRecords = latestSignals.map<HorizonStoreRecord>((signal) => ({
      id: signal.id,
      tenantId,
      runId: signal.input.runId,
      updatedAt: horizonBrand.fromTime(Date.now()),
      signal,
    }));
    setState((previous) => ({
      ...previous,
      isBusy: false,
      runId: response.value.runResult.ok ? String(response.value.runResult.value.runId) : previous.runId,
      plan: latestPlan ?? previous.plan,
      records: latestRecords,
      signals: latestSignals,
      health: response.value.runResult.ok ? 'good' : 'warning',
    }));
  }, [tenantId, loadWindow]);

  useEffect(() => {
    void loadWindow(120);
  }, [loadWindow]);

  const summaryText = useMemo(() => {
    const latest = snapshots[0];
    return latest ? `snapshot ${latest.id}: ${latest.summary}` : 'no run yet';
  }, [snapshots]);

  return {
    tenantId,
    runId: state.runId,
    plan: state.plan,
    runPlan,
    launchFromService,
    loadWindow,
    isBusy: state.isBusy,
    health: state.health,
    signals: state.signals,
    records: state.records,
    trend: toTrend(state.signals),
    summaryText,
  };
};
