import { ok, fail } from '@shared/result';
import type { Result } from '@shared/result';

import {
  bundleEvidence,
  buildRiskAssessment,
  calculateWindow,
  sliceSignalsByWindow,
  type EvidenceWindow,
  type RiskAssessment,
  type RiskContext,
  type RiskRunId,
  type RiskSignal,
} from '@domain/recovery-risk-models';
import type { RecoveryPolicy } from '@domain/recovery-policy';
import type { RecoveryProgram, RecoveryRunState } from '@domain/recovery-orchestration';
import { asRiskSignalEnvelope } from '@data/recovery-risk-store';
import type {
  RecoveryRiskProfileSnapshot,
  RecoveryRiskRepository,
  RiskHistoryPage,
  RiskQuery,
} from '@data/recovery-risk-store';
import type { RecoveryPolicyRepository } from '@data/recovery-policy-store';

export interface RunRiskContext {
  runId: RiskRunId;
  program: RecoveryProgram;
  runState: RecoveryRunState;
  tenant: RecoveryProgram['tenant'];
  policies: readonly RecoveryPolicy[];
  signals: readonly RiskSignal[];
}

export interface RiskEngineDecision {
  readonly assessment: RiskAssessment;
  readonly recommendations: readonly string[];
  readonly shouldAbort: boolean;
  readonly shouldDefer: boolean;
  readonly recommendationsFromSignals: number;
}

export interface RiskEngineDependencies {
  riskRepository: RecoveryRiskRepository;
  policyRepository: RecoveryPolicyRepository;
}

export class RecoveryRiskEngine {
  constructor(private readonly deps: RiskEngineDependencies) {}

  async evaluate(context: RunRiskContext): Promise<Result<RiskEngineDecision, Error>> {
    const now = new Date().toISOString();
    const window: EvidenceWindow = {
      from: context.runState.startedAt ?? now,
      to: now,
      includeRecoveries: true,
      limit: 300,
    };

    const domainContext: RiskContext = {
      programId: context.program.id,
      runId: context.runId,
      tenant: context.tenant,
      currentStatus: context.runState.status,
      allowedWindow: calculateWindow(context.runId, 0),
    };

    const factors = context.policies.map((policy) => ({
      name: `policy:${policy.name}`,
      dimension: 'compliance' as const,
      impact:
        policy.severity === 'critical'
          ? 1
          : policy.severity === 'error'
            ? 0.75
            : policy.severity === 'warn'
              ? 0.5
              : 0.4,
      confidence: policy.enabled ? 0.9 : 0.3,
      evidence: policy.description,
    }));

    const signals = sliceSignalsByWindow(context.signals, window);
    const assessment = buildRiskAssessment(domainContext, signals, factors);
    const recommendations = assessment.findings
      .slice(0, 4)
      .map((finding) => `${finding.factorName}: ${finding.recommendation}`);

    const decision: RiskEngineDecision = {
      assessment,
      recommendations,
      shouldAbort: assessment.severity === 'critical',
      shouldDefer: assessment.score >= 70,
      recommendationsFromSignals: signals.length,
    };

    await this.persistArtifacts(context, assessment, signals);
    return ok(decision);
  }

  async recentRuns(query: RiskQuery): Promise<RiskHistoryPage> {
    const runId = query.runId;
    if (!runId) {
      return {
        items: [],
        hasMore: false,
        total: 0,
        nextCursor: undefined,
      };
    }

    const latest = await this.deps.riskRepository.findLatest(runId);
    const items = latest ? [latest] : [];
    return {
      items,
      hasMore: false,
      total: items.length,
      nextCursor: undefined,
    };
  }

  private async persistArtifacts(
    context: RunRiskContext,
    assessment: RiskAssessment,
    signals: readonly RiskSignal[],
  ): Promise<void> {
    const evidence = bundleEvidence(context.runId, signals, assessment.findings);
    const factors = evidence.topFindings.map((finding) => ({
      name: finding.factorName,
      dimension: finding.dimension,
      impact: finding.score / 100,
      confidence: 0.85,
      evidence: finding.recommendation,
    }));

    const snapshot: RecoveryRiskProfileSnapshot = {
      profileId: `${context.runId}:snapshot` as never,
      runId: context.runId,
      policy: context.policies.at(0),
      assessment,
      window: calculateWindow(context.runId, 0),
      factors,
      createdAt: new Date().toISOString(),
    };

    for (const signal of signals.slice(0, 4)) {
      const encoded = asRiskSignalEnvelope(signal).envelope;
      await this.deps.riskRepository.appendSignal(encoded);
    }

    await this.deps.riskRepository.saveSnapshot(snapshot);
  }
}
