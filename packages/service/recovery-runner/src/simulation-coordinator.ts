import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import {
  runAndEmitSimulationEvents,
  summarizeSimulation,
  type SimulationInput,
  type SimulationSummary,
} from '@domain/recovery-simulation-planning';

import type { RecoverySimulationMetricsRepository } from '@data/recovery-simulation-metrics';
import { InMemorySimulationMetricsRepository } from '@data/recovery-simulation-metrics';
import { createSimulationRecord } from './simulation-translation';

export interface SimulationRunContext {
  readonly tenant: string;
  readonly reason: string;
  readonly initiatedBy: string;
}

export interface SimulationCoordinatorOptions {
  readonly metricsRepository?: RecoverySimulationMetricsRepository;
}

export interface SimulationRunReport {
  readonly summary: SimulationSummary;
  readonly traceCount: number;
  readonly workspaceId: string;
}

export class RecoverySimulationCoordinator {
  private readonly metricsRepository: RecoverySimulationMetricsRepository;

  constructor(
    private readonly context: SimulationRunContext,
    options: SimulationCoordinatorOptions = {},
  ) {
    this.metricsRepository = options.metricsRepository ??
      new InMemorySimulationMetricsRepository();
  }

  async execute(input: SimulationInput, workspaceId: string): Promise<Result<SimulationRunReport, Error>> {
    const result = runAndEmitSimulationEvents(input);
    if (!result.ok) return fail(result.error);
    const record = createSimulationRecord(result.value.summary, result.value.telemetry, workspaceId, this.context.tenant);
    await this.metricsRepository.save(record);
    return ok({
      summary: result.value.summary,
      traceCount: result.value.telemetry.length,
      workspaceId,
    });
  }
}
