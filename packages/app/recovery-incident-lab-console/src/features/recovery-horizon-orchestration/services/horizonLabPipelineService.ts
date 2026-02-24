import { useEffect, useMemo, useState } from 'react';
import {
  type HorizonSignal,
  type JsonLike,
  type PluginStage,
  type HorizonInput,
  horizonBrand,
  type HorizonPlan,
  type TimeMs,
  type PluginConfig,
  type PluginContract,
} from '@domain/recovery-horizon-engine';
import {
  createRepository,
  type HorizonStoreRecord,
  type HorizonReadResult,
  type HorizonLookupConfig,
} from '@data/recovery-horizon-store';
import { launchHorizonSession, type SessionRunResult, type SessionStageConfig, type HorizonRunSession, HorizonRunSession as RunSession } from '@service/recovery-horizon-orchestrator';
import { runMesh, meshHealth, type MeshExecution, type MeshHealth, type MeshMode } from '@service/recovery-horizon-orchestrator/horizon-mesh.js';
import { useMemo as useMemoValue } from 'react';

import type {
  OrchestrationMode,
  OrchestrationPlan,
  RunWindowConfig,
  SeedSignal,
  OrchestrationSummary,
  OrchestrationState,
  WindowTrend,
  ReadWindowResult,
} from '../types';

const DEFAULT_WINDOW: readonly PluginStage[] = ['ingest', 'analyze', 'resolve', 'optimize', 'execute'];

const defaultReadConfig = (tenantId: string, stages: readonly PluginStage[]): HorizonLookupConfig => ({
  tenantId,
  stages,
  includeArchived: false,
  maxRows: 300,
});

const planSignature = <TKind extends PluginStage>(
  plan: OrchestrationPlan,
  stageWindow: readonly TKind[],
): string => `${plan.id}:${plan.window.join('>')}|${stageWindow.join('|')}`;

const buildSeedSignals = <TKind extends PluginStage>(
  tenantId: string,
  stages: readonly TKind[],
): readonly SeedSignal[] =>
  stages.map((stage, index) => {
    const signal: HorizonSignal<TKind, JsonLike> = {
      id: horizonBrand.fromPlanId(`seed:${tenantId}:${stage}:${index}`),
      kind: stage,
      payload: {
        from: 'app.seed',
        rank: index,
      },
      input: {
        version: '1.0.0',
        runId: horizonBrand.fromRunId(`run-${tenantId}:${index}`),
        tenantId,
        stage,
        tags: ['seed', tenantId, stage],
        metadata: {
          source: 'ui',
          order: index,
          staged: true,
        },
      },
      severity: 'low',
      startedAt: horizonBrand.fromDate(new Date(Date.now()).toISOString()),
    };

    return {
      signal,
      rank: index,
      stage,
    };
  });

const aggregateTrend = (rows: readonly HorizonStoreRecord[]): readonly WindowTrend[] => {
  const totals = rows.reduce<Record<PluginStage, number>>(
    (acc, row) => {
      acc[row.signal.kind] = (acc[row.signal.kind] ?? 0) + 1;
      return acc;
    },
    {
      ingest: 0,
      analyze: 0,
      resolve: 0,
      optimize: 0,
      execute: 0,
    },
  );

  const max = Math.max(...Object.values(totals));
  return (['ingest', 'analyze', 'resolve', 'optimize', 'execute'] as const).map((stage) => {
    const count = totals[stage];
    const ratio = max === 0 ? 0 : count / max;
    const severity = ratio > 0.8 ? 'high' : ratio > 0.4 ? 'medium' : 'low';
    return {
      stage,
      count,
      ratio,
      severity,
    };
  });
};

export class HorizonLabPipelineService {
  #tenantId: string;
  #window: readonly PluginStage[];
  #owner: string;
  #mode: OrchestrationMode;

  constructor(config: RunWindowConfig) {
    this.#tenantId = config.tenantId;
    this.#window = config.stages ?? DEFAULT_WINDOW;
    this.#owner = config.owner;
    this.#mode = config.mode;
  }

  get tenantId() {
    return this.#tenantId;
  }

  async loadWindow(maxRows = 120): Promise<ReadWindowResult> {
    const repository = createRepository(this.#tenantId);
    const result = await repository.read(defaultReadConfig(this.#tenantId, this.#window));
    if (!result.ok) {
      return {
        ok: false,
        read: { items: [], total: 0 },
        trend: [],
      };
    }

    const readResult = result.value;
    return {
      ok: true,
      read: readResult,
      trend: aggregateTrend(readResult.items),
    };
  }

  async runMesh(seedPlanId: string): Promise<{ readonly ok: boolean; readonly runId?: string; readonly history?: readonly MeshExecution[] }>
  {
    const plan = this.buildPlan(seedPlanId);
    const seeds = buildSeedSignals(this.#tenantId, this.#window);
    const signals = seeds.map((entry) => entry.signal);
    const meshResult = await runMesh(this.#tenantId, this.#window, signals);
    if (!meshResult.ok) {
      return { ok: false };
    }

    const mode = this.mapMode();
    const filtered = meshResult.value.filter((entry) => mode === 'all' || entry.mode === mode);
    const runId = `${this.#tenantId}:${plan.id}`;

    return {
      ok: true,
      runId,
      history: filtered,
    };
  }

  async launchOrchestrator(seedPlanId: string): Promise<{ readonly ok: boolean; readonly snapshot?: MeshHealth; readonly run?: SessionRunResult['runResult'] }>{
    const sessionResult = await launchHorizonSession({
      tenant: this.#tenantId,
      stages: this.#window,
      owner: this.#owner,
      planName: seedPlanId,
      tags: [this.#owner, this.#mode],
    });

    if (!sessionResult.ok) {
      return { ok: false };
    }

    const health = await meshHealth(this.#tenantId, this.#window);

    return {
      ok: true,
      snapshot: health.ok ? health.value : undefined,
      run: sessionResult.value.runResult,
    };
  }

  async summarize(seedPlanId: string): Promise<OrchestrationSummary> {
    const read = await this.loadWindow(180);
    const plan = this.buildPlan(seedPlanId);
    const mode = this.#mode;
    return {
      planId: plan.id,
      runId: `${this.#tenantId}:${planSignature(plan, this.#window)}`,
      signalCount: read.ok ? read.read.total : 0,
      recordsCount: read.ok ? read.read.items.length : 0,
      trend: read.ok ? read.trend : [],
      mode,
    };
  }

  buildPlan(seedPlanId: string): OrchestrationPlan {
    return {
      id: seedPlanId,
      title: `plan:${seedPlanId}`,
      window: [...this.#window],
      expectedSignals: this.#window.length * 2,
    };
  }

  mapMode(): 'single' | 'multi' | 'canary' | 'all' {
    switch (this.#mode) {
      case 'live':
      case 'single':
        return 'single';
      case 'report-only':
        return 'all';
      default:
        return this.#mode as 'single' | 'multi' | 'canary';
    }
  }
}

export const useHorizonLabPipeline = (tenantId = 'tenant-001', owner = 'recovery-horizon-ui') => {
  const [history, setHistory] = useState<readonly MeshExecution[]>([]);
  const [records, setRecords] = useState<readonly HorizonStoreRecord[]>([]);
  const [ready, setReady] = useState(false);
  const [planLabel, setPlanLabel] = useState('default-plan');

  const service = useMemoValue(
    () => new HorizonLabPipelineService({ tenantId, stages: DEFAULT_WINDOW, owner, mode: 'live' }),
    [tenantId, owner],
  );

  useEffect(() => {
    void service.loadWindow().then((result) => {
      setRecords(result.ok ? result.read.items : []);
      setReady(result.ok);
    });
  }, [service]);

  const trend = useMemoValue(
    () => aggregateTrend(records),
    [records],
  );

  const reload = async () => {
    const next = await service.loadWindow();
    if (next.ok) {
      setRecords(next.read.items);
      setReady(true);
    }
    return next;
  };

  const execute = async () => {
    const output = await service.runMesh(planLabel);
    setHistory(output.history ? [...output.history] : []);
    return output;
  };

  const summary = {
    runId: `${tenantId}:${planLabel}:${Date.now()}`,
    signalCount: records.length,
    recordsCount: records.length,
    trend,
    mode: 'live' as OrchestrationMode,
    planId: planLabel,
  };

  return {
    tenantId,
    planLabel,
    setPlanLabel,
    ready,
    records,
    history,
    trend,
    reload,
    execute,
    summary,
    service,
  };
};
