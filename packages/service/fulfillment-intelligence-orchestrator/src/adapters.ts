import { InMemoryFulfillmentTelemetryStore } from '@data/fulfillment-telemetry-store';
import { FulfillmentExecution } from '@domain/fulfillment-orchestration';
import { summarizeResult, buildSnapshot } from './analyzer';
import { OrchestrationRequest } from './types';
import { createEnvelope } from '@shared/protocol';
import { Result, ok, fail } from '@shared/result';

export interface Publisher {
  publish(topic: string, payload: unknown): Promise<void>;
}

export interface FulfillmentIntelligenceAdapter {
  emitProgress(input: OrchestrationRequest, snapshotId: string): Promise<Result<void>>;
  emitSummary(payload: unknown): Promise<Result<void>>;
}

export class ConsoleFulfillmentIntelligenceAdapter implements FulfillmentIntelligenceAdapter {
  constructor(private readonly telemetry: InMemoryFulfillmentTelemetryStore, private readonly publisher: Publisher) {}

  async emitProgress(_input: OrchestrationRequest, snapshotId: string): Promise<Result<void>> {
    const snapshot = await buildSnapshot(snapshotId, _input.tenantId, {
      planId: `${snapshotId}-plan` as any,
      tenantId: _input.tenantId,
      windows: [],
      scenario: {
        id: 'temp' as any,
        tenantId: _input.tenantId,
        demandProfile: [],
        windows: [],
        strategy: 'baseline',
        score: 0,
        recommendation: 'warmup',
      },
      riskBudget: 0,
      selectedStrategies: ['baseline'],
      slaTargets: [],
      generatedAt: new Date().toISOString(),
    }, this.telemetry);
    if (!snapshot.ok) {
      return fail(snapshot.error);
    }
    await this.publisher.publish('fulfillment-intel.snapshot', snapshot.value);
    return ok(undefined);
  }

  async emitSummary(payload: unknown): Promise<Result<void>> {
    const envelope = createEnvelope('fulfillment.intel.summary', payload);
    await this.publisher.publish('fulfillment.intel.summary', envelope);
    return ok(undefined);
  }
}

export const publishExecution = async (
  execution: FulfillmentExecution,
  adapter: FulfillmentIntelligenceAdapter,
): Promise<Result<void>> => {
  const tenantId = execution.traceId ? String(execution.traceId).split('-')[0] : 'tenant-system';
  await adapter.emitSummary(summarizeResult({
    runId: `${execution.runId}-summary` as any,
    status: 'completed',
    plan: {
      planId: `${execution.planId}-plan` as any,
      tenantId,
      windows: [],
      scenario: {
        id: `${execution.runId}-scenario` as any,
        tenantId,
        demandProfile: [],
        windows: [],
        strategy: 'baseline',
        score: 33,
        recommendation: execution.status,
      },
      riskBudget: 50,
      selectedStrategies: ['baseline'],
      slaTargets: [],
      generatedAt: new Date().toISOString(),
    },
    score: 77,
    topScenario: undefined,
  }));
  return ok(undefined);
};
