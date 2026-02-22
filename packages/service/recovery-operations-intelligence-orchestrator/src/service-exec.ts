import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { RecoveryRiskSignal } from '@domain/recovery-operations-intelligence';
import { createRecoveryIntelligenceService } from './intelligence-orchestration-service';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { IntelligenceRepository } from '@data/recovery-operations-intelligence-store';
import { IntelligenceDecisionService } from './decision';
import type { RunPlanSnapshot, RunSession } from '@domain/recovery-operations-models';
import type { RunAssessment } from '@domain/recovery-operations-intelligence';

export interface ExecutionInput {
  readonly tenant: string;
  readonly runId: string;
  readonly readinessPlan: RecoveryReadinessPlan;
  readonly signals: readonly RecoveryRiskSignal[];
  readonly repositories: {
    operations: RecoveryOperationsRepository;
    intelligence: IntelligenceRepository;
  };
  readonly runPlan: RunPlanSnapshot;
  readonly session: RunSession;
}

export interface ExecutionOutput {
  readonly runId: string;
  readonly tenant: string;
  readonly routingRunId: string;
  readonly score: number;
  readonly decisionSignals: readonly RunAssessment[];
  readonly session: RunSession;
}

const toReadinessSignals = (signals: readonly RecoveryRiskSignal[]): readonly RecoveryRiskSignal[] => signals;

const toDecisionSignals = (signals: readonly RecoveryRiskSignal[]): readonly RunAssessment[] =>
  signals.map((signal) => ({
    runId: signal.runId,
    tenant: `${signal.window.tenant}`,
    riskScore: signal.signal.severity,
    confidence: signal.signal.confidence,
    bucket: 'low',
    intensity: {
      bucket: 'low',
      averageSeverity: signal.signal.severity,
      signalCount: 1,
    },
    constraints: {
      maxParallelism: 1,
      maxRetries: 1,
      timeoutMinutes: 15,
      operatorApprovalRequired: signal.signal.severity >= 8,
    },
    recommendedActions: ['evaluate'],
    plan: ({
      id: signal.envelopeId as RunPlanSnapshot['id'],
      name: `${signal.envelopeId}-${signal.runId}` as RunPlanSnapshot['name'],
      program: {
        id: signal.runId as never,
        name: `${signal.runId}-program`,
        steps: [],
        source: 'intelligence',
        owner: `${signal.window.tenant}`,
        metadata: { source: signal.source },
      } as never,
      constraints: {
        maxParallelism: 1,
        maxRetries: 1,
        timeoutMinutes: 15,
        operatorApprovalRequired: signal.signal.severity >= 8,
      },
      fingerprint: {
      tenant: signal.window.tenant,
        region: 'us-east-1',
        serviceFamily: 'recovery',
        impactClass: 'application',
        estimatedRecoveryMinutes: 15,
      } as never,
      sourceSessionId: undefined,
      effectiveAt: new Date().toISOString(),
    } as RunPlanSnapshot),
  }));

export const executeRecoveryIntelligenceFlow = async (input: ExecutionInput): Promise<ExecutionOutput> => {
  const service = createRecoveryIntelligenceService([]);
  const run = await service.run({
    tenant: input.tenant,
    runId: input.runId,
    readinessPlan: input.readinessPlan,
    signals: toReadinessSignals(input.signals),
    session: input.session,
    repositories: {
      operations: input.repositories.operations,
      intelligence: input.repositories.intelligence,
    },
  });

  const decisionService = new IntelligenceDecisionService({ repositories: input.repositories });
  const decisionResult = await decisionService.evaluatePlan(input.runId, input.readinessPlan, toDecisionSignals(input.signals));

  const score = decisionResult.output.score + run.metrics.assessmentCount / 100;
  return {
    runId: run.runId,
    tenant: run.tenant,
    routingRunId: run.pipeline.runId,
    score,
  decisionSignals: decisionResult.output.assessments,
    session: input.session,
  };
};
