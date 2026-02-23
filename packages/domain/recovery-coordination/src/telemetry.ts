import type {
  CoordinationPlanCandidate,
  CoordinationProgram,
  CoordinationSelectionResult,
  CoordinationWindow,
  CoordinationRunId,
  CoordinationTenant,
} from './types';
import { applyPolicyEnvelope, buildSignals, buildWorkflowGraph } from './workflow';
import { summarizeQuality } from './quality';
import { withBrand } from '@shared/core';

export interface CoordinationTelemetryEnvelope {
  readonly eventType: string;
  readonly tenant: CoordinationTenant | string;
  readonly runId: CoordinationRunId | string;
  readonly window: CoordinationWindow;
  readonly message: string;
  readonly emittedAt: string;
}

interface CoordinationAttemptInputLike {
  readonly commandId: string;
}

interface CoordinationAttemptStateLike {
  readonly phase: string;
  readonly startedAt: string;
  readonly lastUpdatedAt: string;
}

export interface CoordinationAttemptReportLike {
  readonly runId: CoordinationRunId;
  readonly tenant: string;
  readonly accepted: boolean;
  readonly plan: CoordinationPlanCandidate;
  readonly state: CoordinationAttemptStateLike;
}

export interface CoordinationMetrics {
  readonly tenant: CoordinationTenant | string;
  readonly runId: CoordinationRunId | string;
  readonly topologyNodes: number;
  readonly candidateParallelism: number;
  readonly candidateCompletion: number;
  readonly quality: number;
  readonly selectedState: CoordinationSelectionResult['decision'];
}

export const collectAttemptEnvelope = (
  input: CoordinationAttemptInputLike,
  report: CoordinationAttemptReportLike,
): CoordinationTelemetryEnvelope => ({
  eventType: 'recovery.coordination.attempt',
  tenant: report.tenant,
  runId: report.runId,
  window: {
    from: new Date().toISOString(),
    to: new Date(Date.now() + 3600_000).toISOString(),
    timezone: 'UTC',
  },
  message: `${input.commandId}:${report.accepted}:${report.plan.id}`,
  emittedAt: new Date().toISOString(),
});

export const collectProgramEnvelope = (program: CoordinationProgram): CoordinationTelemetryEnvelope => ({
  eventType: 'recovery.coordination.program',
  tenant: program.tenant,
  runId: program.id,
  window: program.runWindow,
  message: `program:${program.id}:${program.incidentId}:${program.steps.length}`,
  emittedAt: new Date().toISOString(),
});

export const collectCandidateEnvelope = (candidate: CoordinationPlanCandidate): CoordinationTelemetryEnvelope => ({
  eventType: 'recovery.coordination.candidate',
  tenant: candidate.tenant,
  runId: candidate.runId,
  window: {
    from: new Date().toISOString(),
    to: new Date(Date.now() + 60000 * candidate.metadata.expectedCompletionMinutes).toISOString(),
    timezone: 'UTC',
  },
  message: `candidate:${candidate.id}:${candidate.sequence.join(',')}`,
  emittedAt: new Date().toISOString(),
});

export const buildMetrics = (
  tenant: string,
  runId: string,
  program: CoordinationProgram,
  selection: CoordinationSelectionResult,
): CoordinationMetrics => {
  const graph = buildWorkflowGraph(program);
  const signals = buildSignals(program);
  const quality = summarizeQuality(program.constraints, program.steps);

  const avgParallelism = signals.length
    ? signals.reduce((sum, signal) => sum + (1 + selection.selectedCandidate.metadata.parallelism) + (signal.code.length % 5), 0) / signals.length
    : 1;

  return {
    tenant,
    runId,
    topologyNodes: graph.nodes.length,
    candidateParallelism: avgParallelism,
    candidateCompletion: selection.selectedCandidate.metadata.expectedCompletionMinutes,
    quality,
    selectedState: selection.decision,
  };
};

export const buildPolicyEnvelope = (selection: CoordinationSelectionResult): CoordinationTelemetryEnvelope => ({
  eventType: 'recovery.coordination.selection',
  tenant: selection.runId,
  runId: selection.runId,
  window: {
    from: new Date().toISOString(),
    to: new Date(Date.now() + 120000).toISOString(),
    timezone: 'UTC',
  },
  message: `decision:${selection.decision}:blocked=${selection.blockedConstraints.length}:reasons=${selection.reasons.length}`,
  emittedAt: new Date().toISOString(),
});

export const collectStateEnvelope = (
  tenant: string,
  report: CoordinationAttemptReportLike,
): CoordinationTelemetryEnvelope => {
  const state = applyPolicyEnvelope({
    policy: {
      policyId: withBrand(`${tenant}:policy-default`, 'RecoveryPolicyId'),
      result: report.accepted ? 'approved' : 'deferred',
      confidence: report.accepted ? 0.85 : 0.42,
      reasons: report.state ? [`state=${report.state.phase}`] : ['state-missing'],
      evaluatedAt: new Date().toISOString(),
    },
    candidate: report.plan,
    signals: [],
    selection: {
      runId: report.runId,
      selectedCandidate: report.plan,
      alternatives: [report.plan],
      decision: report.accepted ? 'approved' : 'deferred',
      blockedConstraints: ['none'],
      reasons: ['inference'],
      selectedAt: new Date().toISOString(),
    },
  });

  return {
    eventType: 'recovery.coordination.state',
    tenant,
    runId: report.runId,
    window: {
      from: new Date(report.state.startedAt).toISOString(),
      to: report.state.lastUpdatedAt,
      timezone: 'UTC',
    },
    message: `run:${state.runId}:phase=${state.phase}:run=${state.runId}`,
    emittedAt: new Date().toISOString(),
  };
};
