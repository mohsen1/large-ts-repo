import { AdaptivePolicy, SignalContext, createAdaptationPlan, pickTopByConfidence } from '@domain/adaptive-ops';
import { AdaptiveDecision, SignalSample, AdaptiveRun } from '@domain/adaptive-ops';
import { RunnerContext, RunnerInput, RunnerResult } from './types';

const toSignalContext = (context: RunnerContext): SignalContext => ({
  tenantId: context.tenantId as never,
  services: context.policies.flatMap((policy) => policy.dependencies.map((dependency) => dependency.serviceId)),
  window: {
    startsAt: new Date(Date.now() - context.signalWindowSec * 1000).toISOString(),
    endsAt: new Date().toISOString(),
    zone: 'us-east-1',
  },
});

const makeRun = (tenantId: string, signalWindowSec: number, decisions: readonly AdaptiveDecision[]): AdaptiveRun => ({
  incidentId: `${tenantId}-${Date.now()}` as never,
  policyId: decisions[0]?.policyId ?? (`${tenantId}-fallback` as never),
  serviceWindow: {
    startsAt: new Date(Date.now() - signalWindowSec * 1000).toISOString(),
    endsAt: new Date().toISOString(),
    zone: 'us-east-1',
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: decisions.length === 0 ? 'queued' : 'running',
  decisions: [...decisions],
});

export const runAdaptation = (input: RunnerInput): RunnerResult => {
  const signalContext = toSignalContext(input.context);
  const decisions = input.context.policies.flatMap((policy) => {
    const plan = createAdaptationPlan({
      tenantId: input.context.tenantId,
      policies: [policy],
      signals: input.signals,
      context: signalContext,
    });
    return plan.decisions;
  });

  const sorted = [...decisions].sort((left, right) => right.confidence - left.confidence);
  const run = makeRun(input.context.tenantId, input.context.signalWindowSec, sorted);
  const topDecision = pickTopByConfidence(sorted);
  const firstAction = topDecision?.selectedActions[0] ?? null;

  return {
    run,
    decisions: sorted,
    firstAction,
  };
};
