import { err, ok, type Result } from '@shared/result';
import { HorizonOrchestrator, runHorizonPlan } from '@service/recovery-horizon-orchestrator';
import { RecoveryHorizonRepository } from '@data/recovery-horizon-store';
import {
  type HorizonOrchestratorConfig,
  type HorizonOrchestratorResult,
  type HorizonQuery,
  type HorizonRunContext,
  type HorizonServiceStats,
  type StageReport,
  type HorizonRunnerContract,
  type HorizonServiceSnapshot,
} from '@service/recovery-horizon-orchestrator';
import {
  PluginStage,
  HorizonPlan,
  HorizonSignal,
  JsonLike,
  TimeMs,
  RunId,
  PlanId,
  horizonBrand,
} from '@domain/recovery-horizon-engine';
import {
  type HorizonLookupConfig,
  type HorizonReadResult,
  type HorizonMutationEvent,
} from '@data/recovery-horizon-store';

const defaultConfig: HorizonOrchestratorConfig = {
  tenantId: 'tenant-001',
  planName: 'recovery-horizon-lab-default',
  stageWindow: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
  refreshIntervalMs: 4500,
  tags: ['recovery', 'stress-lab'],
  owner: 'ops-ui',
};

const nowMs = (): TimeMs => horizonBrand.fromTime(Date.now());

const buildPlan = (seed: number, tenantId: string): HorizonPlan => ({
  id: horizonBrand.fromPlanId(`plan-${tenantId}-${seed}`) as PlanId,
  tenantId,
  startedAt: nowMs(),
  pluginSpan: {
    stage: 'analyze',
    label: 'ANALYZE_STAGE',
    startedAt: nowMs(),
    durationMs: 1200 as any,
  },
});

export class HorizonLabService {
  #repo: RecoveryHorizonRepository;
  #orchestrator: HorizonOrchestrator;
  #state: HorizonRunContext;

  constructor(
    repository = new RecoveryHorizonRepository(['tenant-001', 'tenant-002']),
    config: HorizonOrchestratorConfig = defaultConfig,
  ) {
    this.#repo = repository;
    this.#orchestrator = new HorizonOrchestrator(this.#repo, config);
    this.#state = {
      runId: horizonBrand.fromRunId(`svc-${Date.now()}`) as RunId,
      startedAt: nowMs(),
      state: 'idle',
      stageWindow: config.stageWindow,
    };
  }

  async start(plan: HorizonPlan): Promise<Result<HorizonOrchestratorResult>> {
    const result = await runHorizonPlan(
      this.#repo,
      {
        tenantId: plan.tenantId,
        planName: `service-${plan.id}`,
        stageWindow: defaultConfig.stageWindow,
        refreshIntervalMs: 1200,
        tags: ['auto', 'manual'],
        owner: 'service',
      },
      plan,
    );

    if (!result.ok) {
      return err(result.error);
    }

    this.#state = {
      ...this.#state,
      state: 'running',
      startedAt: nowMs(),
    };

    return ok(result.value);
  }

  async status(
    tenantId: string,
  ): Promise<{ context: HorizonRunContext; signals: readonly HorizonSignal<PluginStage, JsonLike>[] }> {
    const snapshot = await this.#orchestrator.snapshot({
      tenantId,
      stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
      maxRows: 250,
    });

    return {
      context: snapshot.state,
      signals: snapshot.latest.signals,
    };
  }

  async query(config: HorizonQuery): Promise<HorizonReadResult> {
    try {
      return await this.#orchestrator.query({
        tenantId: config.tenantId,
        includeArchived: config.includeArchived,
        maxRows: config.maxRows,
      });
    } catch {
      return {
        items: [],
        total: 0,
      };
    }
  }

  async getReport(config: HorizonLookupConfig): Promise<StageReport> {
    const value = await this.#orchestrator.report(config);
    return value;
  }

  async getStats(config: HorizonLookupConfig): Promise<HorizonServiceStats> {
    const response = await this.#orchestrator.stats(config);
    return response;
  }

  async flushPlan(planId: PlanId): Promise<Result<true>> {
    try {
      const replay = await this.#repo.read({ tenantId: planId as string, maxRows: 1 });
      void replay;
      return await this.#orchestrator.drain(planId);
    } catch (error) {
      return err(error as Error);
    }
  }

  async replayEvents(config: HorizonLookupConfig): Promise<readonly HorizonMutationEvent[]> {
    try {
      return await this.#orchestrator.replayEvents(config);
    } catch {
      return [];
    }
  }

  static bootstrapSamples(seed: number): readonly HorizonPlan[] {
    return Array.from({ length: seed }).map((_, index) => buildPlan(index + 1, 'tenant-001'));
  }
}

export const runAutoPilot = async (
  service: HorizonLabService,
  tenantId: string,
): Promise<HorizonRunContext> => {
  const plans = HorizonLabService.bootstrapSamples(3);
  const selected = plans.find((plan) => plan.tenantId === tenantId) ?? plans[0];
  const result = await service.start(selected);
  if (!result.ok) {
    throw result.error;
  }
  const status = await service.status(tenantId);
  return status.context;
};

export const buildServiceHandle = (service: HorizonLabService = new HorizonLabService()): HorizonRunnerContract => ({
  run: async (plan) => {
    const result = await service.start(plan);
    if (!result.ok) {
      throw result.error;
    }
    return result.value;
  },
  query: async (input) => service.query(input),
  snapshot: async (input) => {
    const status = await service.status(input.tenantId);
    return {
      tenantId: input.tenantId,
      state: status.context,
      latest: {
        plans: [],
        signals: status.signals,
      },
    };
  },
  drain: async (planId) => {
    const result = await service.flushPlan(planId);
    if (!result.ok) {
      throw result.error;
    }
    return result;
  },
  replayEvents: async (input) => service.replayEvents(input),
});
