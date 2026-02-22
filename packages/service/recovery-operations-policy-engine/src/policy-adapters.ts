import type { PolicyResultEnvelope, PolicyTimeline, PolicyExecutionContext } from './policy-types';

export interface PolicyStepRecord {
  readonly phase: 'prepare' | 'evaluate' | 'score' | 'publish';
  readonly status: 'ok' | 'warn' | 'fail';
  readonly message: string;
}

export const toTimelinePoints = (
  runId: string,
  steps: readonly PolicyStepRecord[],
): ReadonlyArray<{ at: string; phase: PolicyStepRecord['phase']; status: PolicyStepRecord['status']; message: string }> => {
  return steps.map((step, index) => ({
    at: new Date(Date.now() + index * 500).toISOString(),
    phase: step.phase,
    status: step.status,
    message: `${runId} ${step.phase} ${step.message}`,
  }));
};

export const buildTimeline = (runId: string, tenant: string, outcome: Pick<PolicyResultEnvelope, 'state' | 'summary'>): PolicyTimeline => {
  const status: 'ok' | 'warn' | 'fail' = outcome.state === 'allowed' ? 'ok' : outcome.state === 'running' ? 'warn' : 'fail';

  const steps: PolicyStepRecord[] = [
    { phase: 'prepare', status: 'ok', message: 'context prepared' },
    {
      phase: 'evaluate',
      status,
      message: outcome.summary.decisionReason,
    },
    { phase: 'score', status: 'ok', message: `confidence ${outcome.summary.confidence}` },
    { phase: 'publish', status: 'ok', message: outcome.summary.decision },
  ];

  return {
    tenant,
    runId,
    points: toTimelinePoints(runId, steps),
  };
};

export const extractContextFingerprint = (context: Pick<PolicyExecutionContext, 'tenant' | 'runId' | 'sessionId'>) => ({
  tenant: context.tenant,
  runId: context.runId,
  sessionId: context.sessionId,
});
