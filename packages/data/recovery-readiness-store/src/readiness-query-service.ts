import type { ReadinessSignal, ReadinessRunId, ReadinessPolicy } from '@domain/recovery-readiness';
import type { ReadinessReadModel } from './models';
import { buildModelMetrics, toSignalsAggregate } from './readiness-metrics';
import type { ReadinessModelMetrics, ReadinessSignalsAggregate } from './readiness-metrics';

export interface ReadinessSearchFilter {
  runId?: ReadinessRunId;
  owner?: string;
  minSignals?: number;
  maxSignals?: number;
  hasSource?: ReadinessSignal['source'];
  riskBand?: ReadinessReadModel['plan']['riskBand'];
}

export interface ReadinessSearchResult {
  runId: ReadinessRunId;
  owner: string;
  state: ReadinessReadModel['plan']['state'];
  riskBand: ReadinessReadModel['plan']['riskBand'];
  signalCount: number;
  matchConfidence: number;
  policySummary: {
    policyId: string;
    blockedSourceCount: number;
  };
}

export interface ReadinessQueryServiceSnapshot {
  updatedAt: string;
  rows: ReadonlyArray<ReadinessSearchResult>;
}

export class ReadinessQueryService {
  private readonly index = new Map<ReadinessRunId, ReadinessReadModel>();

  upsert(model: ReadinessReadModel): void {
    this.index.set(model.plan.runId, model);
  }

  upsertMany(models: readonly ReadinessReadModel[]): void {
    for (const model of models) {
      this.upsert(model);
    }
  }

  list(): ReadinessReadModel[] {
    return Array.from(this.index.values());
  }

  listByOwner(owner: string): ReadinessSearchResult[] {
    return this.list()
      .filter((model) => model.plan.metadata.owner === owner)
      .map((model) => this.toResult(model, this.resolvePolicyFromModel(model)));
  }

  find(filter: ReadinessSearchFilter): ReadinessSearchResult[] {
    return this.list()
      .filter((model) => {
        if (filter.runId && model.plan.runId !== filter.runId) {
          return false;
        }
        if (filter.owner && model.plan.metadata.owner !== filter.owner) {
          return false;
        }
        if (filter.riskBand && model.plan.riskBand !== filter.riskBand) {
          return false;
        }
        if (filter.minSignals !== undefined && model.signals.length < filter.minSignals) {
          return false;
        }
        if (filter.maxSignals !== undefined && model.signals.length > filter.maxSignals) {
          return false;
        }
        if (filter.hasSource && !model.signals.some((signal) => signal.source === filter.hasSource)) {
          return false;
        }
        return true;
      })
      .map((model) => this.toResult(model, this.resolvePolicyFromModel(model)));
  }

  snapshot(limit = 12): ReadinessQueryServiceSnapshot {
    const rows = this.list()
      .slice(0, limit)
      .map((model) => this.toResult(model, this.resolvePolicyFromModel(model)));
    return {
      updatedAt: new Date().toISOString(),
      rows,
    };
  }

  signalAggregate(runId: ReadinessRunId): ReadinessSignalsAggregate {
    const model = this.index.get(runId);
    if (!model) {
      return {
        runId,
        totalsBySeverity: {
          low: 0,
          medium: 0,
          high: 0,
          critical: 0,
        },
        totalsBySource: {
          telemetry: 0,
          synthetic: 0,
          'manual-check': 0,
        },
        hourlyBuckets: {},
        topTargets: [],
      };
    }
    return toSignalsAggregate(model.signals);
  }

  metrics(runId: ReadinessRunId): ReadinessModelMetrics | undefined {
    const model = this.index.get(runId);
    return model ? buildModelMetrics(model) : undefined;
  }

  remove(runId: ReadinessRunId): boolean {
    return this.index.delete(runId);
  }

  clear(): void {
    this.index.clear();
  }

  private resolvePolicyFromModel(model: ReadinessReadModel): ReadinessPolicy {
    const blockedSignalSources = model.signals.map((signal) => signal.source);
    return {
      policyId: `policy:${model.plan.planId}`,
      name: `policy:${model.plan.planId}`,
      constraints: {
        key: `constraints:${model.plan.planId}`,
        minWindowMinutes: 30,
        maxWindowMinutes: 480,
        minTargetCoveragePct: 0.6,
        forbidParallelity: model.plan.state === 'active',
      },
      allowedRegions: new Set(model.targets.map((target) => target.region)),
      blockedSignalSources: [...new Set(blockedSignalSources)],
    };
  }

  private toResult(model: ReadinessReadModel, policy: ReadinessPolicy): ReadinessSearchResult {
    const metrics = buildModelMetrics(model);
    const blockedSourceCount = policy.blockedSignalSources.length;
    const matchConfidence = Math.min(1, Math.max(0, (model.signals.length / Math.max(metrics.uniqueTargets, 1)) * 0.2));
    return {
      runId: model.plan.runId,
      owner: model.plan.metadata.owner,
      state: model.plan.state,
      riskBand: model.plan.riskBand,
      signalCount: model.signals.length,
      matchConfidence: Number(matchConfidence.toFixed(3)),
      policySummary: {
        policyId: policy.policyId,
        blockedSourceCount,
      },
    };
  }
}

