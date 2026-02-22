import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import { runRecoveryCommandCenter } from './command-center';
import { inspectCommandWindow } from './command-observer';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoverySignal, RunSession, RunPlanSnapshot } from '@domain/recovery-operations-models';
import { withBrand } from '@shared/core';

export interface OperationCommandRequest {
  readonly tenant: string;
  readonly repository: RecoveryOperationsRepository;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly session: RunSession;
  readonly snapshot: {
    readonly id: string;
    readonly program: any;
  };
  readonly signals: readonly RecoverySignal[];
}

export interface OperationCommandResponse {
  readonly centerSummary: string;
  readonly forecast: string;
  readonly analyticsSummary: string;
  readonly commandGraph: string;
  readonly trendSummary: string;
}

export class CommandBridge {
  constructor(private readonly repository: RecoveryOperationsRepository) {}

  async run(request: OperationCommandRequest): Promise<OperationCommandResponse> {
    const planSnapshot: RunPlanSnapshot = {
      id: withBrand(request.snapshot.id, 'RunPlanId'),
      name: `command-center-${request.snapshot.id}`,
      constraints: {
        maxParallelism: 1,
        maxRetries: 1,
        timeoutMinutes: 15,
        operatorApprovalRequired: false,
      },
      fingerprint: {
        tenant: withBrand(request.readinessPlan.metadata.tenant ?? request.tenant, 'TenantId'),
        region: 'global',
        serviceFamily: 'recovery-console',
        impactClass: 'application',
        estimatedRecoveryMinutes: Math.max(1, request.signals.length),
      },
      sourceSessionId: request.session.id,
      effectiveAt: new Date().toISOString(),
      program: request.snapshot.program as RunPlanSnapshot['program'],
    };

    const result = await runRecoveryCommandCenter({
      tenant: request.tenant,
      repository: this.repository,
      readinessPlan: request.readinessPlan,
      session: request.session,
      snapshot: {
        ...planSnapshot,
        id: planSnapshot.id,
      },
      signals: request.signals,
    });

    const trend = await inspectCommandWindow(this.repository, request.tenant, String(request.session.runId));

    return {
      centerSummary: result.commandSummary,
      forecast: result.forecastSummary,
      analyticsSummary: `coverage=${result.analyticsReport.runCoverage} rejection=${result.analyticsReport.approvals.rejectionRate}`,
      commandGraph: result.graphDot,
      trendSummary: `acceptance=${trend.acceptanceRate.toFixed(2)} reasons=${trend.lastReasonCodes.join(',')}`,
    };
  }
}

export const buildAndRunCommandBridge = async (
  repository: RecoveryOperationsRepository,
  request: Omit<OperationCommandRequest, 'repository'>,
): Promise<OperationCommandResponse> => {
  const bridge = new CommandBridge(repository);
  return bridge.run({ ...request, repository });
};

export const commandBridgeSummary = (input: OperationCommandResponse): string => {
  return `summary=${input.centerSummary} trend=${input.trendSummary}`;
};

export { inspectCommandWindow } from './command-observer';
