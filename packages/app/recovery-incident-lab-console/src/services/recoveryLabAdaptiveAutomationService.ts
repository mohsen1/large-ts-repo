import {
  adaptiveService,
  type OrchestrationOutcome,
  type ServiceResult,
  type CampaignDiagnostic,
  type CampaignPlan,
  type TenantId,
  type CampaignRunResult,
  type CampaignSnapshot,
} from '@domain/recovery-lab-adaptive-orchestration';

export interface AdaptiveRunRequest {
  readonly tenantId: TenantId;
  readonly scenario: string;
  readonly seed: Record<string, unknown>;
  readonly runMode: 'simulate' | 'validate' | 'execute';
}

export interface AdaptiveRunResponse<TPayload = unknown> {
  readonly outcome: OrchestrationOutcome<TPayload>;
  readonly sessionId: string;
  readonly startedAt: string;
  readonly diagnostics: readonly CampaignDiagnostic[];
  readonly snapshots: readonly CampaignSnapshot<TPayload>[];
  readonly metrics: {
    readonly snapshotCount: number;
    readonly diagnosticCount: number;
    readonly fingerprint: string;
    readonly legacyFingerprint: string;
  };
}

export const runAdaptiveCampaign = async <TPayload extends Record<string, unknown>>(
  request: AdaptiveRunRequest,
): Promise<AdaptiveRunResponse<TPayload>> => {
  const result: ServiceResult<TPayload> = await adaptiveService.runCampaign<TPayload>({
    tenantId: request.tenantId,
    scenario: request.scenario,
    seed: request.seed,
    dryRun: request.runMode === 'validate',
  });

  const sortedDiagnostics = result.outcome.diagnostics.toSorted((left, right) => {
    if (left.phase !== right.phase) {
      return left.phase.localeCompare(right.phase);
    }
    return left.at.localeCompare(right.at);
  });

  return {
    outcome: result.outcome,
    sessionId: result.session.id,
    startedAt: result.session.startedAt,
    diagnostics: sortedDiagnostics,
    snapshots: result.outcome.snapshots as readonly CampaignSnapshot<TPayload>[],
    metrics: {
      snapshotCount: result.metrics.snapshotCount,
      diagnosticCount: result.metrics.diagnosticCount,
      fingerprint: result.metrics.fingerprint,
      legacyFingerprint: result.metrics.legacyFingerprint,
    },
  };
};

export const summarizeAdaptiveResult = <TPayload extends Record<string, unknown>>(
  response: AdaptiveRunResponse<TPayload>,
): string => {
  const lastDiagnostic = response.diagnostics.at(-1);
  return [
    `session=${response.sessionId}`,
    `phase=${response.outcome.context.phases.join('>')}`,
    `diagnostics=${response.metrics.diagnosticCount}`,
    `snapshots=${response.metrics.snapshotCount}`,
    `fingerprint=${response.metrics.fingerprint}`,
    `legacy=${response.metrics.legacyFingerprint}`,
    `last=${lastDiagnostic ? `${lastDiagnostic.phase}:${lastDiagnostic.message}` : 'none'}`,
  ].join(' | ');
};

export const renderDiagnosticRows = (diagnostics: readonly CampaignDiagnostic[]): string => {
  return diagnostics
    .map((entry) => `${entry.phase} ${entry.pluginId} ${entry.message}`)
    .join('\n');
};

export const buildPlanCoverage = (plan: CampaignPlan): Record<string, number> => {
  return {
    totalSteps: plan.steps.length,
    signalPolicies: plan.signalPolicy.length,
    riskProfile: plan.riskProfile,
  };
};

export const calculateSignalHealth = (run: CampaignRunResult): number => {
  const errors = run.diagnostics.filter((entry) => entry.tags.includes('error') || entry.tags.includes('critical')).length;
  const warnings = run.diagnostics.filter((entry) => entry.tags.includes('warn')).length;
  return Math.max(0, 100 - (errors * 14) - (warnings * 4));
};
