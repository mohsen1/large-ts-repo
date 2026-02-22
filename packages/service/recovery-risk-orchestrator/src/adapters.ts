import { fail, ok, type Result } from '@shared/result';
import type { RiskConnector, ConnectorMetrics } from '@infrastructure/recovery-risk-connectors';
import type { StrategyExecutionResult, StrategySignalPack } from '@domain/recovery-risk-strategy';
import { classifySeverity } from '@domain/recovery-risk-strategy';
import { parsePublishedPack } from '@infrastructure/recovery-risk-connectors/src/transformers';

export interface AdapterResult {
  readonly strategy: StrategyExecutionResult;
  readonly pack: StrategySignalPack;
  readonly traceId: string;
}

export interface RuntimeSnapshot {
  readonly total: number;
  readonly accepted: number;
  readonly rejected: number;
}

export const hydrateFromConnectorPayload = (raw: unknown): Result<AdapterResult, Error> => {
  const parsed = parsePublishedPack(raw);
  if (!parsed.ok) {
    return fail(parsed.error);
  }

  const run = parsed.value.strategyRun;

  return ok({
    strategy: {
      run,
      vector: parsed.value.vectorPack,
      severityBand: classifySeverity(run.score),
      recommendation: `loaded ${run.runId}`,
      logs: [
        {
          runId: run.runId,
          state: 'enriched',
          timestamp: new Date().toISOString(),
          note: `hydrated by connector ${parsed.value.envelope.connectorId}`,
        },
      ],
    },
    pack: parsed.value.vectorPack,
    traceId: parsed.value.envelope.correlationId,
  });
};

export class RuntimeMetricsCollector {
  private total = 0;
  private accepted = 0;
  private rejected = 0;

  record(accepted: boolean): void {
    this.total += 1;
    this.accepted += accepted ? 1 : 0;
    this.rejected += accepted ? 0 : 1;
  }

  snapshot(): RuntimeSnapshot {
    return {
      total: this.total,
      accepted: this.accepted,
      rejected: this.rejected,
    };
  }
}

export class ConnectorAdapter {
  private readonly metrics = new RuntimeMetricsCollector();

  constructor(private readonly connectors: readonly RiskConnector[]) {}

  async ingest(raw: unknown): Promise<Result<AdapterResult, Error>> {
    const parsed = hydrateFromConnectorPayload(raw);
    if (!parsed.ok) {
      this.metrics.record(false);
      return fail(parsed.error);
    }

    this.metrics.record(true);
    return ok(parsed.value);
  }

  metricsSnapshot(): ConnectorMetrics {
    const snapshot = this.metrics.snapshot();
    return {
      totalPublished: snapshot.total,
      totalAccepted: snapshot.accepted,
      totalRejected: snapshot.rejected
        ? [{ reason: 'parse-error', count: snapshot.rejected }]
        : [],
    };
  }
}
