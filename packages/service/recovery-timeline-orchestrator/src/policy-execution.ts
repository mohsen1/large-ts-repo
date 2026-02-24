import { InMemoryTimelineRepository } from '@data/recovery-timeline-store';
import type { RecoveryTimeline } from '@domain/recovery-timeline';
import { Result } from '@shared/result';
import { buildPlanFromFilter, emitPathReport } from '@domain/recovery-timeline';
import { createPolicyOrchestrator } from './advanced-orchestrator';
import { OrchestrationInput, OrchestrationResult } from './types';

export interface TimelinePolicyRunPlan {
  readonly timelineId: string;
  readonly pathReport: string;
  readonly actions: readonly string[];
  readonly snapshotId: string;
}

export function buildTimelinePolicyPlan(timeline: RecoveryTimeline): TimelinePolicyRunPlan {
  const report = emitPathReport(timeline);
  const pathIds = buildPlanFromFilter(timeline, {});
  return {
    timelineId: timeline.id,
    pathReport: report,
    actions: pathIds,
    snapshotId: `${timeline.id}-${pathIds.length}`,
  };
}

export async function runPolicyAwareOrchestration(
  repository: InMemoryTimelineRepository,
  timelineId: string,
  action: OrchestrationInput['requestedAction'],
  actor: string,
): Promise<Result<OrchestrationResult>> {
  const loaded = repository.load(timelineId);
  if (!loaded.ok) {
    return loaded;
  }

  const orchestrator = createPolicyOrchestrator();
  return orchestrator.run(
    {
      timeline: loaded.value,
      actor,
      requestedAction: action,
      dryRun: false,
    },
    repository,
  );
}
