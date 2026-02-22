import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import { MemoryReadinessRepository, type ReadinessRepository } from '@data/recovery-readiness-store';
import type { ReadinessSignal, RecoveryReadinessPlanDraft, RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { ReadinessPolicy } from '@domain/recovery-readiness';
import { envelopeToReadinessSignalEnvelope } from '@domain/recovery-readiness';
import { mapImpactSignals } from '@domain/recovery-readiness';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import { RecoveryReadinessOrchestrator, type RecoveryRunnerOptions } from './index';

export interface CommandInput {
  readonly draft: RecoveryReadinessPlanDraft;
  readonly signals: readonly ReadinessSignal[];
  readonly policy: ReadinessPolicy;
}

export interface CommandResult {
  readonly runId: ReadinessReadModel['plan']['runId'];
  readonly planId: RecoveryReadinessPlan['planId'];
  readonly createdAt: string;
}

export interface ConsoleFacade {
  bootstrap(input: CommandInput): Promise<Result<CommandResult, Error>>;
  rehearse(runId: ReadinessReadModel['plan']['runId']): Promise<Result<string, Error>>;
  summarize(): Promise<{ total: number; averageRisk: number; warnings: number }>;
}

export class ReadinessConsoleFacade implements ConsoleFacade {
  private readonly repo: ReadinessRepository;
  private readonly orchestrator: RecoveryReadinessOrchestrator;

  constructor(options: Omit<RecoveryRunnerOptions, 'policy'> & { policy: ReadinessPolicy }) {
    this.repo = options.repo ?? new MemoryReadinessRepository();
    this.orchestrator = new RecoveryReadinessOrchestrator(options);
  }

  async bootstrap(input: CommandInput): Promise<Result<CommandResult, Error>> {
    if (!input.policy.allowedRegions.size) {
      return fail(new Error('policy-missing-allowed-regions'));
    }

    const bootstrapResult = await this.orchestrator.bootstrap(input.draft, [...input.signals]);
    if (!bootstrapResult.ok) {
      return fail(bootstrapResult.error);
    }

    const runId = input.draft.runId;
    const model = await this.repo.byRun(runId);
    if (!model) {
      return fail(new Error('bootstrap-model-missing'));
    }

    const envelopes = model.signals.map((signal, index) => envelopeToReadinessSignalEnvelope(signal, index));
    const signalProfile = mapImpactSignals(model.signals, model.directives);
    const planId = model.plan.planId;
    const computedAt = envelopes[0]?.envelope?.computedAt;
    const createdAt =
      typeof computedAt === 'string' ? computedAt : model.updatedAt;

    return ok({
      runId,
      planId,
      createdAt,
    });
  }

  async rehearse(runId: ReadinessReadModel['plan']['runId']): Promise<Result<string, Error>> {
    const reconcile = await this.orchestrator.reconcile(runId);
    if (!reconcile.ok) {
      return fail(reconcile.error);
    }

    const state = await this.repo.byRun(runId);
    if (!state) {
      return fail(new Error('rehearse-run-missing'));
    }

    const signature = this.buildSignature(state);
    return ok(`${signature}-${reconcile.value}`);
  }

  async summarize(): Promise<{ total: number; averageRisk: number; warnings: number }> {
    const runs = await this.repo.listActive();
    if (runs.length === 0) {
      return { total: 0, averageRisk: 0, warnings: 0 };
    }

    const runSignatures = runs.map((run) => this.buildSignature(run));
    const warnings = runSignatures.filter((entry) => entry.risk > 80).length;
    const averageRisk = Number((runSignatures.reduce((sum, entry) => sum + entry.risk, 0) / runSignatures.length).toFixed(2));

    return {
      total: runs.length,
      averageRisk,
      warnings,
    };
  }

  private buildSignature(run: ReadinessReadModel): { runId: string; planId: string; risk: number } {
    const plan = run.plan;
    const impact = mapImpactSignals(run.signals, run.directives);
    const forecastPeak = impact.cells.reduce((max, cell) => Math.max(max, cell.forecastPeak), 0);
    return {
      runId: plan.runId,
      planId: plan.planId,
      risk: forecastPeak + impact.summary.signalVolume,
    };
  }
}
