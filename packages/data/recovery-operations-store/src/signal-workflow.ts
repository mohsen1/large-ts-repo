import type { RecoveryOperationsEnvelope, RecoverySignal } from '@domain/recovery-operations-models';
import type { RecoveryPolicyConfig, PolicyEvaluation } from '@domain/recovery-operations-models/recovery-policy-rules';
import type { RankedSignalPortfolios } from '@domain/recovery-operations-models/signal-portfolio';
import { withBrand } from '@shared/core';
import type { RecoveryOperationsRepository } from './repository';

export interface SignalWorkflowSnapshot {
  readonly tenant: string;
  readonly runId: string;
  readonly policyDecision: string;
  readonly portfolios: readonly RankedSignalPortfolios[];
  readonly reports: readonly string[];
  readonly createdAt: string;
}

export interface SignalIngestionResult {
  readonly accepted: boolean;
  readonly runId: string;
  readonly signalId: string;
  readonly score: number;
  readonly tenant: string;
}

interface Dependencies {
  readonly repository: RecoveryOperationsRepository;
  readonly policy: PolicyEvaluation;
}

const buildScore = (signals: readonly RecoverySignal[]): number => {
  if (!signals.length) return 0;
  const total = signals.reduce((acc, signal) => acc + signal.severity * signal.confidence, 0);
  return Number((total / signals.length).toFixed(4));
};

const mapSignalsToReportPayload = (signals: readonly RecoverySignal[]) => ({
  signals,
  assessments: [],
  sessions: [],
  decisions: [],
});

export const collectSignalsForTenant = (
  tenant: string,
  envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
): readonly RecoverySignal[] => {
  return envelopes
    .filter((entry) => entry.tenant === tenant)
    .map((entry) => ({ ...entry.payload, detectedAt: new Date().toISOString() }));
};

export class SignalWorkflowManager {
  private readonly snapshots = new Map<string, SignalWorkflowSnapshot>();

  constructor(private readonly dependencies: Dependencies) {}

  async ingestSignalBundle(
    tenant: string,
    envelopes: readonly RecoveryOperationsEnvelope<RecoverySignal>[],
  ): Promise<readonly SignalIngestionResult[]> {
    const results: SignalIngestionResult[] = [];

    for (const [index, envelope] of envelopes.entries()) {
      const signal = envelope.payload;
      const runId = String(withBrand(`${tenant}:${index}`, 'RecoveryRunId'));
      const score = buildScore([signal]);
      const accepted = this.dependencies.policy.decision === 'allow';

      if (accepted) {
        await this.dependencies.repository.upsertSession({
          id: withBrand(`${tenant}:signal:${signal.id}`, 'RunSessionId'),
          runId: withBrand(runId, 'RecoveryRunId'),
          ticketId: withBrand(`${tenant}:ticket:${index}`, 'RunTicketId'),
          planId: withBrand(`${tenant}:plan`, 'RunPlanId'),
          status: 'queued',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          constraints: {
            maxParallelism: this.dependencies.policy.policy.budget.maxParallelism,
            maxRetries: this.dependencies.policy.policy.budget.maxRetries,
            timeoutMinutes: this.dependencies.policy.policy.budget.timeoutMinutes,
            operatorApprovalRequired: this.dependencies.policy.policy.enforceManualApproval,
          },
          signals: [signal],
        });
      }

      results.push({
        accepted,
        runId,
        signalId: signal.id,
        score,
        tenant,
      });
    }

    return results;
  }

  async buildSnapshot(
    tenant: string,
    runId: string,
    portfolios: readonly RankedSignalPortfolios[],
    signals: readonly RecoverySignal[],
  ): Promise<SignalWorkflowSnapshot> {
    const payload = mapSignalsToReportPayload(signals);
    const report = JSON.stringify({
      tenant,
      ...payload,
      payloadGeneratedAt: new Date().toISOString(),
    });
    const snapshot: SignalWorkflowSnapshot = {
      tenant,
      runId,
      policyDecision: this.dependencies.policy.decision,
      portfolios,
      reports: [report],
      createdAt: new Date().toISOString(),
    };

    this.snapshots.set(`${tenant}:${runId}`, snapshot);
    return snapshot;
  }

  getSnapshot(tenant: string, runId: string): SignalWorkflowSnapshot | undefined {
    return this.snapshots.get(`${tenant}:${runId}`);
  }
}

export const summarizePolicy = (policy: RecoveryPolicyConfig): string => {
  return `${policy.id} tenant=${policy.tenant} auto=${!policy.enforceManualApproval}`;
};
