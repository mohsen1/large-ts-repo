import { RecoveryReadinessOrchestrator } from './orchestrator';
import {
  ReadinessCommandRouter,
  type ReadinessCommandInput,
  type ReadinessCommandRecord,
} from './readiness-command-router';
import { ReadinessWorkbench, createReadinessPolicy } from './readiness-workbench';
import type { ReadinessPolicy, ReadinessRunId, ReadinessSignal, RecoveryTargetId } from '@domain/recovery-readiness';
import { InMemoryReadinessEventStore } from '@data/recovery-readiness-store';
import { MemoryReadinessRepository } from '@data/recovery-readiness-store';
import { ReadinessQueryService } from '@data/recovery-readiness-store';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';

export interface ReadinessOperationsConsoleStatus {
  policy: string;
  bootstraps: number;
  regions: readonly string[];
  snapshots: number;
  lastEvents: number;
  health: {
    bootstrapRuns: number;
    status: string;
  };
}

export interface ReadinessOperationsView {
  runId: ReadinessRunId;
  owner: string;
  state: ReadinessReadModel['plan']['state'];
  riskBand: ReadinessReadModel['plan']['riskBand'];
  summary: string;
}

const buildSyntheticSignals = (runId: ReadinessRunId, count = 6): ReadinessSignal[] =>
  new Array(count).fill(0).map((_, index) => ({
    signalId: `${runId}:s:${index}` as ReadinessSignal['signalId'],
    runId,
    source: index % 2 === 0 ? 'manual-check' : 'telemetry',
    targetId: `target-${index % 3}` as ReadinessSignal['targetId'],
    name: `ops:${index}`,
    severity: index % 3 === 0 ? 'high' : index % 3 === 1 ? 'medium' : 'low',
    capturedAt: new Date(Date.now() + index * 60_000).toISOString(),
    details: {
      owner: runId,
      index,
    },
  }));

export class ReadinessOperationsConsole {
  private readonly orchestrator: RecoveryReadinessOrchestrator;
  private readonly queryService = new ReadinessQueryService();
  private readonly eventStore = new InMemoryReadinessEventStore(new MemoryReadinessRepository());
  private readonly workbench: ReadinessWorkbench;
  private readonly commandRouter: ReadinessCommandRouter;
  private bootstrapCount = 0;

  constructor(policy?: ReadinessPolicy) {
    const resolved = policy ?? createReadinessPolicy('operations-console');
    this.orchestrator = new RecoveryReadinessOrchestrator({ policy: resolved });
    this.workbench = new ReadinessWorkbench(resolved);
    this.commandRouter = new ReadinessCommandRouter(resolved);
  }

  async bootstrap(input: ReadinessCommandInput): Promise<ReadinessRunId> {
    const dispatched = await this.commandRouter.dispatch({
      verb: 'bootstrap',
      tenantId: input.tenantId,
      owner: input.owner ?? input.tenantId,
      signals: input.signals ?? 10,
    });

    if (!dispatched.ok) {
      throw dispatched.error;
    }

    const runId = `${input.tenantId}:${Date.now()}` as ReadinessRunId;
    const signals = buildSyntheticSignals(runId, input.signals ?? 10);
    const bootstrap = await this.orchestrator.bootstrap(
      {
        runId,
        title: `run:${input.tenantId}`,
        objective: 'stabilize',
        owner: input.owner ?? input.tenantId,
        targetIds: [input.tenantId as RecoveryTargetId],
        directiveIds: [],
      },
      signals,
    );

    if (!bootstrap.ok) {
      throw bootstrap.error;
    }

    this.bootstrapCount += 1;
    const model = (await this.orchestrator.inspect(runId)) as never;
    if (model) {
      this.queryService.upsert(model as unknown as ReadinessReadModel);
      this.workbench.score(model as unknown as ReadinessReadModel);
    }

    return runId;
  }

  async reconcile(runId: ReadinessRunId): Promise<void> {
    await this.orchestrator.reconcile(runId);
    await this.commandRouter.dispatch({ verb: 'reconcile', tenantId: runId, runId });
  }

  async status(runId: ReadinessRunId): Promise<ReadinessOperationsView | undefined> {
    const model = this.queryService.list().find((item) => item.plan.runId === runId);
    if (!model) return undefined;
    const score = this.workbench.score(model).score;
    return {
      runId,
      owner: model.plan.metadata.owner,
      state: model.plan.state,
      riskBand: model.plan.riskBand,
      summary: `score=${score}`,
    };
  }

  async emitEventHealth(runId: ReadinessRunId) {
    return this.eventStore.health(runId);
  }

  async snapshot(): Promise<ReadinessOperationsConsoleStatus> {
    const health = await this.orchestrator.healthSnapshot();
    return {
      policy: this.workbench.status.policy,
      bootstraps: this.bootstrapCount,
      regions: this.workbench.status.allowedRegions,
      snapshots: this.workbench.status.snapshots,
      lastEvents: this.commandRouter.listHistory().length,
      health,
    };
  }

  commandHistory(limit = 8): ReadinessCommandRecord[] {
    return this.commandRouter.listHistory(limit);
  }

  get latestRuns(): ReadonlyArray<ReadinessRunId> {
    return this.workbench.listRunIds();
  }
}
