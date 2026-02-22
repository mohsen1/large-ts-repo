import type { ReadinessReadModel, SignalFilter } from './models';
import { filterBySignalCriteria } from './queries';
import type { ReadinessDirective, ReadinessRunId, RecoveryReadinessPlan, ReadinessSignal } from '@domain/recovery-readiness';
import { sortByRiskBand } from './queries';
import { commandWindowToStepIndex, canPlaybookRunInParallel, type ContinuityPlaybookStep } from '@domain/recovery-readiness'
export interface ReadinessQueryContext {
  readonly tenant?: string;
  readonly includeLowConfidence?: boolean;
  readonly from?: string;
  readonly to?: string;
}

export interface QuerySlice {
  readonly runId: ReadinessRunId;
  readonly topDirectiveIndex: number;
  readonly signalDensity: number;
  readonly allowsParallelPlaybook: boolean;
}

export interface QueryTimelinePoint {
  readonly at: string;
  readonly runId: ReadinessRunId;
  readonly signals: number;
  readonly directives: number;
}

export function queryByTenant(
  models: readonly ReadinessReadModel[],
  tenant: string,
  context: ReadinessQueryContext,
): readonly QuerySlice[] {
  const filtered = filterBySignalCriteria(models, { ...context, owner: tenant } as SignalFilter);
  const sorted = sortByRiskBand(filtered);

  return sorted.map((model) => {
    const steps: ContinuityPlaybookStep[] = model.directives.map((item, index) => ({
      id: item.directiveId,
      label: item.name,
      order: index,
      durationMinutes: item.timeoutMinutes,
      owners: model.plan.targets.map((target) => target.ownerTeam),
      prerequisites: item.dependsOn.map((dependency) => dependency.directiveId),
      canParallelize: canPlaybookRunInParallel(
        [],
        {
          allowParallelism: itemAllowed(model.plan),
        },
      ),
    }));

    const stepIndex = commandWindowToStepIndex(
      model.directives[0]?.directiveId ?? (`noop:${model.plan.runId}` as ReadinessDirective['directiveId']),
      steps,
    );

    const allowsParallelPlaybook = canPlaybookRunInParallel(steps, {
      allowParallelism: itemAllowed(model.plan),
    });

    return {
      runId: model.plan.runId,
      topDirectiveIndex: stepIndex,
      signalDensity: model.signals.length / Math.max(1, model.plan.signals.length),
      allowsParallelPlaybook,
    };
  });
}

export function queryTimeline(models: readonly ReadinessReadModel[]): QueryTimelinePoint[] {
  return models
    .flatMap((model) =>
      model.signals.map((signal) => ({
        at: signal.capturedAt,
        runId: model.plan.runId,
        signals: 1,
        directives: model.directives.length,
      })),
    )
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
}

function itemAllowed(plan: RecoveryReadinessPlan): boolean {
  const hasOwner = plan.metadata.owner.length > 0;
  const hasSignals = plan.signals.length > 0;
  return hasOwner && hasSignals;
}

export function topSignalsByRun(models: readonly ReadinessReadModel[], runId: ReadinessRunId): readonly ReadinessSignal[] {
  const model = models.find((entry) => entry.plan.runId === runId);
  if (!model) {
    return [];
  }

  return [...model.signals].sort((left, right) => Date.parse(right.capturedAt) - Date.parse(left.capturedAt)).slice(0, 10);
}
