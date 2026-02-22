import { DrillObservabilityPipeline } from '@service/recovery-drill-observability/src/pipeline';
import { ok, fail } from '@shared/result';
import type { Result } from '@shared/result';

export interface RecoverDrillConsoleCommand {
  readonly command: 'ingest' | 'ingestMetric' | 'query' | 'snapshot';
  readonly runId?: string;
  readonly tenant?: string;
  readonly payload?: unknown;
}

export class RecoveryDrillObserverConsole {
  constructor(private readonly pipeline: DrillObservabilityPipeline = new DrillObservabilityPipeline()) {}

  async execute(command: RecoverDrillConsoleCommand): Promise<Result<unknown, Error>> {
    if (command.command === 'ingest') {
      if (!command.runId) return fail(new Error('runId-required'));
      return this.pipeline.ingestUnknown(command.runId, command.payload);
    }

    if (command.command === 'ingestMetric') {
      if (!command.runId) return fail(new Error('runId-required'));
      return this.pipeline.ingestMetric(command.runId, command.payload);
    }

  if (command.command === 'query') {
      const tenant = command.tenant as unknown as never;
      if (!tenant) return fail(new Error('tenant-required'));
      return this.pipeline.queryMetrics({ tenant, pageSize: 100 });
    }

    if (command.command === 'snapshot') {
      if (!command.tenant) return fail(new Error('tenant-required'));
      return this.pipeline.tenantSnapshot(command.tenant as unknown as never);
    }

    return fail(new Error('unsupported-command'));
  }
}
