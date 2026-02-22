import { fail, ok, type Result } from '@shared/result';
import { readModelHealths, snapshotStore, buildIncidentStream } from '@data/recovery-readiness-store';
import type { ReadinessPolicy, ReadinessSignal, ReadinessRunId } from '@domain/recovery-readiness';
import { projectReadinessStrategies } from '@domain/recovery-readiness';
import { MemoryReadinessRepository, type ReadinessRepository } from '@data/recovery-readiness-store';
import { RecoveryReadinessOrchestrator, type RecoveryRunnerOptions } from './orchestrator';

export interface FleetOverview {
  total: number;
  active: number;
  warningRuns: number;
  topRunId?: ReadinessRunId;
}

export interface FleetSignalMetric {
  runId: ReadinessRunId;
  owner: string;
  score: number;
  signalDensity: number;
  anomalyCount: number;
}

export interface FleetSearchInput {
  tenant?: string;
  source?: ReadinessSignal['source'];
  limit?: number;
}

export class ReadinessCommandAnalytics {
  private readonly repo: ReadinessRepository;
  private readonly orchestrator: RecoveryReadinessOrchestrator;
  private readonly policy: ReadinessPolicy;

  constructor(options: Omit<RecoveryRunnerOptions, 'policy'> & { policy: ReadinessPolicy }) {
    this.repo = options.repo ?? new MemoryReadinessRepository();
    this.policy = options.policy;
    this.orchestrator = new RecoveryReadinessOrchestrator(options);
  }

  async overview(): Promise<Result<FleetOverview, Error>> {
    const active = await this.repo.listActive();
    const state = snapshotStore(active);
    const warnings = state.rollup.warnings;
    const topRunId = active
      .map((run) => run.plan.runId)
      .sort((left, right) => left.localeCompare(right))[0];
    return ok({
      total: state.snapshot.totalSignals,
      active: active.length,
      warningRuns: warnings,
      topRunId: state.rollup.topRun ?? topRunId,
    });
  }

  async metrics(input: FleetSearchInput = {}): Promise<Result<FleetSignalMetric[], Error>> {
    const active = await this.repo.listActive();
    const filtered = active.filter((run) => (input.tenant ? run.plan.metadata.owner.includes(input.tenant) : true));
    const healths = readModelHealths(filtered);

    const mapped = filtered.map((run) => {
      const hasFilteredSource = input.source ? run.signals.some((signal) => signal.source === input.source) : true;
      if (!hasFilteredSource) {
        return undefined;
      }
      const topRun = healths.find((entry) => entry.runId === run.plan.runId);
      const anomalyCount = projectReadinessStrategies(
        [{ plan: run.plan, targets: run.targets, signals: run.signals, directives: run.directives }],
        this.policy,
      )[0]?.score
        ? 1
        : 0;
      return {
        runId: run.plan.runId,
        owner: run.plan.metadata.owner,
        score: topRun?.score ?? 0,
        signalDensity: run.signals.length / Math.max(1, run.targets.length),
        anomalyCount,
      };
    });

    const metrics = mapped.filter((entry): entry is FleetSignalMetric => entry !== undefined);
    return ok(metrics.slice(0, input.limit ?? 20).sort((left, right) => right.score - left.score));
  }

  async streamDigest() {
    const active = await this.repo.listActive();
    const stream = buildIncidentStream(active);
    return {
      streamId: stream.streamId,
      events: stream.events.length,
      activeRunCount: stream.activeRunIds.length,
    };
  }

  async run(command: 'refresh' | 'replay', runId?: string): Promise<Result<string, Error>> {
    if (command === 'refresh') {
      const status = await this.orchestrator.status({
        command: 'list',
        requestedBy: 'analytics',
        correlationId: 'refresh',
      });
      return ok(`${status.runs.length}`);
    }
    if (command === 'replay' && runId) {
      const runIdToken = runId as ReadinessRunId;
      const model = await this.repo.byRun(runIdToken);
      if (!model) {
        return fail(new Error('missing-run-id'));
      }
      const state = this.orchestrator;
      const result = await state.reconcile(runIdToken);
      return result.ok ? ok(`reconciled:${result.value}`) : fail(result.error);
    }
    return fail(new Error('invalid-command'));
  }
}
