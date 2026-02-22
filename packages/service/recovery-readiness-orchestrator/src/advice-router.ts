import type { ReadinessReadModel, RunIndex } from '@data/recovery-readiness-store';
import { summarizeRunbookReadiness } from '@data/recovery-readiness-store';
import { digestModelReadiness } from '@data/recovery-readiness-store';
import { auditReadinessPlan } from '@domain/recovery-readiness';
import type { ReadinessDirective, ReadinessPolicy, RecoveryReadinessPlan, ReadinessSignal } from '@domain/recovery-readiness';
import type { ReadinessPolicy as Policy } from '@domain/recovery-readiness'
export interface ReadinessAdvice {
  readonly runId: ReadinessReadModel['plan']['runId'];
  readonly recommendation: string;
  readonly confidence: number;
}

export interface RoutedAdvice {
  readonly byRun: readonly ReadinessAdvice[];
  readonly topRun: string;
  readonly severity: 'low' | 'medium' | 'high';
}

function resolvePolicy(model: ReadinessReadModel): Policy {
  return {
    policyId: `policy:${model.plan.runId}`,
    name: `${model.plan.title} policy`,
    constraints: {
      key: `policy:${model.plan.runId}`,
      minWindowMinutes: 10,
      maxWindowMinutes: 120,
      minTargetCoveragePct: 0.2,
      forbidParallelity: model.plan.riskBand === 'red',
    },
    allowedRegions: new Set(model.plan.targets.map((target) => target.region)),
    blockedSignalSources: [],
  };
}

export function buildAdviceMap(models: readonly ReadinessReadModel[]): RoutedAdvice {
  const summary = summarizeRunbookReadiness(models);
  const recommendations: ReadinessAdvice[] = summary.map((entry, index) => {
    const model = models.find((candidate) => candidate.plan.runId === entry.runId);
    if (!model) {
      return {
        runId: entry.runId,
        recommendation: 'no-model',
        confidence: 0,
      };
    }

    const policy = resolvePolicy(model);
    const audit = auditReadinessPlan({
      plan: model.plan,
      directives: model.directives as unknown as ReadinessDirective[],
      signals: model.signals as unknown as ReadinessSignal[],
      policy,
    });

    const digest = digestModelReadiness(model);
    const confidence = Math.max(0.1, Math.min(1, digest.policyAlerts || 1));

    const rec =
      audit.status === 'fail'
        ? 'suppress-then-replay'
        : model.plan.riskBand === 'red'
          ? 'increase-guardrails'
          : index === 0
            ? 'prioritize-critical-directives'
            : 'continue-normal-op';

    return {
      runId: entry.runId,
      recommendation: rec,
      confidence,
    };
  });

  const topRun = recommendations[0]?.runId ?? 'none';
  const highCount = recommendations.filter((item) => item.confidence > 0.8).length;

  const severity: RoutedAdvice['severity'] = highCount > Math.floor(recommendations.length * 0.5) ? 'high' : highCount > 1 ? 'medium' : 'low';

  return {
    byRun: recommendations,
    topRun,
    severity,
  };
}

export function mapIndicesFromModels(models: readonly ReadinessReadModel[]): readonly RunIndex[] {
  return models
    .map((model) => ({
      runId: model.plan.runId,
      planId: model.plan.planId,
      state: model.plan.state,
      riskBand: model.plan.riskBand,
      owner: model.plan.metadata.owner,
      tags: model.plan.metadata.tags,
    }))
    .sort((left, right) => left.owner.localeCompare(right.owner));
}

export function runToPolicyAdvice(plan: RecoveryReadinessPlan): string {
  if (plan.riskBand === 'red') {
    return `pause-operations:${plan.runId}`;
  }
  if (plan.signals.length === 0) {
    return `seed-signals:${plan.runId}`;
  }
  return `observe:${plan.runId}`;
}
