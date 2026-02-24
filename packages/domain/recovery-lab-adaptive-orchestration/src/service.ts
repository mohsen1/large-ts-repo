import { InMemoryCampaignAdapterBundle } from './adapter';
import type { CampaignAdapterBundle, CampaignRunSession } from './adapter';
import { OrchestratorRuntime } from './orchestrator';
import {
  buildDiagnosticsFingerprint as fingerprintFromDiagnostics,
  type DiagnosticsFingerprint,
} from './diagnostics';
import type { OrchestrationInput, OrchestrationOutcome } from './orchestrator';
import type {
  CampaignPlan,
  CampaignRunResult,
  CampaignSnapshot,
  TenantId,
  CampaignDiagnostic,
} from './types';

export interface ServicePlanRequest {
  readonly tenantId: TenantId;
  readonly scenario: string;
  readonly seed: Record<string, unknown>;
  readonly dryRun?: boolean;
  readonly includeSnapshot?: boolean;
}

export interface ServiceResult<TPayload = unknown> {
  readonly outcome: OrchestrationOutcome<TPayload>;
  readonly session: {
    readonly id: string;
    readonly startedAt: string;
  };
  readonly metrics: {
    readonly snapshotCount: number;
    readonly diagnosticCount: number;
    readonly fingerprint: string;
    readonly legacyFingerprint: string;
  };
}

export class RecoveryLabAdaptiveService {
  readonly #runtime: OrchestratorRuntime;
  readonly #bundles = new Set<CampaignAdapterBundle>();

  constructor(runtime = new OrchestratorRuntime()) {
    this.#runtime = runtime;
  }

  async runCampaign<TPayload extends Record<string, unknown> = Record<string, unknown>>(
    request: ServicePlanRequest,
    bundle: CampaignAdapterBundle = new InMemoryCampaignAdapterBundle(),
  ): Promise<ServiceResult<TPayload>> {
    this.#bundles.add(bundle);

    const runSession: CampaignRunSession = await bundle.store.startRun(`${request.tenantId}:${request.scenario}` as any);
    const startedAt = new Date().toISOString();

    try {
      const input: OrchestrationInput<Record<string, unknown>> = {
        tenantId: request.tenantId,
        scenario: request.scenario,
        seed: request.seed,
        dryRun: request.dryRun,
      };

      const outcome = await this.#runtime.runCampaign({
        ...input,
        phases: ['ingest', 'plan', 'execute', 'verify', 'synthesize'],
        adapter: bundle,
      });

      const diagnostics = this.#diagnose(outcome.diagnostics);
      const fingerprint: DiagnosticsFingerprint = fingerprintFromDiagnostics(diagnostics);
      const metrics = {
        snapshotCount: outcome.snapshots.length,
        diagnosticCount: outcome.diagnostics.length,
        fingerprint: fingerprint.value,
        legacyFingerprint: JSON.stringify(buildLegacyDiagnosticLines(diagnostics)),
      };

      const result: ServiceResult<TPayload> = {
        outcome: outcome as OrchestrationOutcome<TPayload>,
        session: {
          id: runSession.id,
          startedAt,
        },
        metrics,
      };
      return result;
    } finally {
      await runSession[Symbol.asyncDispose]();
      this.#bundles.delete(bundle);
    }
  }

  async evaluatePlan(plan: CampaignPlan, seed: Record<string, unknown>): Promise<CampaignRunResult<Record<string, unknown>>> {
    const adapter = new InMemoryCampaignAdapterBundle();
    const session: CampaignRunSession = await adapter.store.startRun(`eval:${plan.planId}` as any);
    try {
      const scenario = `${plan.title}-${plan.campaignId}`;
      const outcome = await this.#runtime.runCampaign({
        tenantId: plan.tenantId,
        scenario,
        seed,
        phases: ['plan', 'verify'],
        adapter,
      });
      return {
        ...outcome.output,
        ok: outcome.output.ok,
      };
    } finally {
      await session[Symbol.asyncDispose]();
    }
  }

  listActiveRunCount(): number {
    return this.#bundles.size;
  }

  #diagnose(diagnostics: readonly CampaignDiagnostic[]): readonly CampaignDiagnostic[] {
    return diagnostics.toSorted((left, right) => {
      const lhs = left.phase.localeCompare(right.phase);
      if (lhs !== 0) {
        return lhs;
      }
      return left.pluginId.localeCompare(right.pluginId);
    });
  }
}

const buildLegacyDiagnosticLines = (diagnostics: readonly unknown[]): readonly string[] => {
  return diagnostics.map((entry) => `${String(entry)}`);
};

export const adaptiveService = new RecoveryLabAdaptiveService();

export const estimateThroughput = (count: number, snapshots: readonly CampaignSnapshot[]): number => {
  if (count <= 0) {
    return 0;
  }
  const divisor = Math.max(1, snapshots.length);
  return (count * 1000) / divisor;
};
