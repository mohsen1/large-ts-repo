import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import type { RecoveryPlanExecution, RecoveryPlaybookQuery } from '@domain/recovery-playbooks';
import {
  InMemoryPlaybookTelemetryRecorder,
  telemetryEnvelope,
  type PlaybookTelemetryAggregate,
  type TenantPlaybookSignal,
} from '@domain/recovery-playbooks/telemetry';
import type { RecoveryPlaybookRepository } from '@data/recovery-playbook-store';
import { toExecutionReport } from '@domain/recovery-playbooks/portfolio';
import { buildSignalsFromReport } from '@domain/recovery-playbooks/telemetry';

interface MonitorState {
  readonly portfolioId: string;
  readonly tenant: string;
  readonly context: string;
}

export interface PlaybookExecutionMonitor {
  capture(run: RecoveryPlanExecution, context: string): void;
  update(run: RecoveryPlanExecution): Promise<void>;
  emit(portfolioId: string): Promise<Result<readonly PlaybookTelemetryAggregate[], string>>;
}

export class RecoveryPlaybookMonitor implements PlaybookExecutionMonitor {
  private readonly recorder = new InMemoryPlaybookTelemetryRecorder();
  private readonly snapshots = new Map<string, MonitorState>();
  private readonly runsById = new Map<string, RecoveryPlanExecution>();

  constructor(private readonly repository: RecoveryPlaybookRepository) {}

  capture(run: RecoveryPlanExecution, tenantId: string): void {
    this.runsById.set(run.id, run);
    const signal: TenantPlaybookSignal = {
      tenant: tenantId,
      playbookId: String(run.playbookId),
      severity: this.impactFromRun(run),
      latencyMinutes: 0,
      status: 'running',
      context: {
        tenantId,
        serviceId: 'service-monitor',
        incidentType: 'monitoring',
        affectedRegions: ['global'],
        triggeredBy: run.operator,
      },
      metadata: {
        operator: run.operator,
        snapshot: run.selectedStepIds.length,
      },
    };
    const start = telemetryEnvelope({
      portfolioId: withBrand(`${tenantId}:${run.id}`, 'PlaybookPortfolioId'),
      tenant: tenantId,
      kind: 'run-started',
      payload: signal,
    });
    this.recorder.append(start);
    this.snapshots.set(run.id, {
      portfolioId: start.portfolioId,
      tenant: tenantId,
      context: 'monitor',
    });
  }

  async update(run: RecoveryPlanExecution): Promise<void> {
    const active = this.runsById.get(run.id) ?? run;
    const state = this.snapshots.get(run.id);
    if (!state) return;

    const kind = active.status === 'completed'
      ? 'run-completed'
      : active.status === 'failed'
        ? 'run-failed'
        : 'run-aborted';
    const report = toExecutionReport(active, active.telemetry.attempts * 4, []);
    const signal: TenantPlaybookSignal = {
      tenant: state.tenant,
      playbookId: String(report.run.playbookId),
      severity: this.impactFromRun(active),
      latencyMinutes: report.elapsedMinutes,
      status: active.status === 'completed' ? 'completed' : active.status === 'failed' ? 'failed' : 'aborted',
      context: {
        tenantId: state.tenant,
        serviceId: 'service-monitor',
        incidentType: state.context,
        affectedRegions: ['global'],
        triggeredBy: active.operator,
      },
      metadata: {
        errorCount: active.telemetry.failures,
        recovered: active.telemetry.recoveredStepIds.length,
      },
    };
    const envelope = telemetryEnvelope({
      portfolioId: withBrand(state.portfolioId, 'PlaybookPortfolioId'),
      tenant: state.tenant,
      kind,
      payload: signal,
    });

    this.recorder.append(envelope);
    this.runsById.set(run.id, active);

    for (const signal of buildSignalsFromReport({
      tenantId: state.tenant,
      serviceId: 'service-monitor',
      incidentType: state.context,
      affectedRegions: ['global'],
      triggeredBy: active.operator,
    }, report)) {
      void signal;
    }
  }

  async emit(portfolioId: string): Promise<Result<readonly PlaybookTelemetryAggregate[], string>> {
    const snapshot = this.recorder.snapshot().filter((entry) => entry.portfolioId === portfolioId);
    if (!snapshot.length) return fail('no-telemetry-data');
    return ok(snapshot);
  }

  async synchronize(query: {
    tenantId: string;
    status?: RecoveryPlaybookQuery['status'];
  }): Promise<Result<number, string>> {
    const catalog = await this.repository.query({
      tenantId: withBrand(query.tenantId, 'TenantId'),
      status: query.status,
      limit: 100,
    });
    if (!catalog.ok) return fail(catalog.error);
    for (const item of catalog.value.items) {
      const run = [...this.runsById.values()].find((entry) => entry.playbookId === item.playbook.id);
      if (!run) continue;
      await this.update(run);
    }
    return ok(this.runsById.size);
  }

  private impactFromRun(run: RecoveryPlanExecution): number {
    if (run.selectedStepIds.length === 0) return 0;
    const stepPressure = run.selectedStepIds.length / 24;
    const failures = run.telemetry.failures / Math.max(1, run.telemetry.recoveredStepIds.length + run.telemetry.failures);
    return Math.min(1, Math.max(0, stepPressure + failures));
  }
}

export const createMonitor = (repository: RecoveryPlaybookRepository): RecoveryPlaybookMonitor =>
  new RecoveryPlaybookMonitor(repository);
