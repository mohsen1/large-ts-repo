import type {
  CommandOrchestrationResult,
  CommandSurface,
  CommandSelectionCriteria,
  CommandCandidate,
  CommandPlanSummary,
} from '@domain/recovery-ops-orchestration-surface';
import type { OrchestrationRunRecord, RecoveryOpsOrchestrationStore } from '@data/recovery-ops-orchestration-store';
import type { Result } from '@shared/result';
import { ok, fail } from '@shared/result';
import { randomUUID } from 'node:crypto';

export interface OrchestrationGateway {
  persistSurface(surface: CommandSurface): Promise<Result<true, Error>>;
  publishSelection(result: CommandOrchestrationResult): Promise<Result<true, Error>>;
}

const gatewayDelayMs = (): number => 30 + Math.floor(Math.random() * 50);

export class InMemoryOrchestrationGateway implements OrchestrationGateway {
  constructor(private readonly store: RecoveryOpsOrchestrationStore) {}

  async persistSurface(surface: CommandSurface): Promise<Result<true, Error>> {
    await sleep(gatewayDelayMs());

    const id = `surface-${randomUUID()}`;
    const outcome = this.store.addSurface({
      id,
      surface,
      createdAt: new Date().toISOString(),
      queryContext: {
        tenantId: surface.tenantId,
        scenarioId: surface.scenarioId,
      },
      generatedBy: surface.metadata.owner,
      metadata: surface.metadata,
    });

    return outcome.ok ? ok(true) : fail(new Error(outcome.error.message));
  }

  async publishSelection(result: CommandOrchestrationResult): Promise<Result<true, Error>> {
    await sleep(gatewayDelayMs());

    const record = this.store.recordRun({
      id: `run-${randomUUID()}`,
      planId: result.chosenPlanId,
      surface: result.surface,
      runAt: new Date().toISOString(),
      result,
      selected: true,
      notes: ['gateway recorded', `score=${result.score}`, `risk=${result.riskScore}`],
    });

    return record.ok ? ok(true) : fail(new Error(record.error.message));
  }
}

export const hydrateRun = (run: OrchestrationRunRecord): string => `${run.id}:${run.result.chosenPlanId}`;

export const summarizeForGateway = (
  candidates: readonly CommandCandidate[],
  criteria: CommandSelectionCriteria,
): string => {
  const topPlan = candidates[0]?.id ?? 'none';
  return `candidates=${candidates.length},best=${topPlan},minConf=${criteria.minConfidence}`;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
