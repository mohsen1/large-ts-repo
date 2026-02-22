import type {
  RunAssessment,
  CohortSignalAggregate,
  BatchReadinessAssessment,
  RecoveryRiskSignal,
} from '@domain/recovery-operations-intelligence';
import type { IntelligenceRepository } from '@data/recovery-operations-intelligence-store';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import { runIntelligencePipeline, type PipelineOutput } from './pipeline';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import { withBrand } from '@shared/core';
import { buildBatchAssessment, aggregateByTenantAndRun } from '@domain/recovery-operations-intelligence';

export interface DecisionDependencies {
  readonly repositories: {
    operations: RecoveryOperationsRepository;
    intelligence: IntelligenceRepository;
  };
}

export interface DecisionResult {
  readonly output: PipelineOutput;
  readonly cohorts: readonly CohortSignalAggregate[];
  readonly batch: BatchReadinessAssessment;
}

export class IntelligenceDecisionService {
  constructor(private readonly deps: DecisionDependencies) {}

  async evaluatePlan(planId: string, readinessPlan: RecoveryReadinessPlan, candidateSignals: readonly RunAssessment[]): Promise<DecisionResult> {
    if (!candidateSignals.length) {
      return {
        output: {
          tenant: 'default',
          runId: 'empty',
          score: 0,
          assessments: [],
          batchRisk: 'green',
        },
        cohorts: [],
        batch: {
          cohort: [],
          generatedAt: new Date(0).toISOString(),
          overallRisk: 'green',
        },
      };
    }

    const tenant = candidateSignals[0]?.tenant ?? 'default';
    const runId = `${tenant}-${planId}` as const;
    const signalLike: readonly RecoveryRiskSignal[] = candidateSignals.map((assessment) => ({
      runId: withBrand(runId, 'IntelligenceRunId'),
      envelopeId: `${planId}-${Math.random()}`,
      source: 'queue',
      signal: {
        id: `${planId}-signal`,
        source: 'internal',
        severity: Math.max(1, Math.min(10, assessment.riskScore)),
        confidence: assessment.confidence,
        detectedAt: new Date().toISOString(),
        details: {},
      },
      window: {
        tenant: withBrand(tenant, 'TenantId'),
        from: new Date(Date.now() - 60_000).toISOString(),
        to: new Date().toISOString(),
        zone: readinessPlan.windows[0]?.timezone ?? 'UTC',
      },
      tags: ['decision', planId],
    }));

    const pipeline = await runIntelligencePipeline(
      {
        tenant,
        runId: withBrand(runId, 'IntelligenceRunId'),
        readinessPlan,
        signals: signalLike,
      },
      this.deps.repositories,
    );

    if (!pipeline.ok) {
      return {
        output: {
          tenant,
          runId,
          score: 0,
          assessments: [],
          batchRisk: 'red',
        },
        cohorts: [],
        batch: { cohort: [], generatedAt: new Date().toISOString(), overallRisk: 'red' },
      };
    }

    const batch = buildBatchAssessment(aggregateByTenantAndRun(signalLike));
    return {
      output: pipeline.value,
      cohorts: batch.cohort,
      batch,
    };
  }
}

export const createDecisionService = (deps: DecisionDependencies): IntelligenceDecisionService =>
  new IntelligenceDecisionService(deps);
