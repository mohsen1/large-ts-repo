import { InMemoryTimelineRepository } from '@data/recovery-timeline-store';
import type { RecoveryTimeline } from '@domain/recovery-timeline';
import { createOrchestrationSession } from './engine';

export function runDryAdvance(repository: InMemoryTimelineRepository, timeline: RecoveryTimeline): RecoveryTimeline {
  const orchestrator = createOrchestrationSession();
  const result = orchestrator.run({
    timeline,
    dryRun: true,
    actor: 'scheduler',
    requestedAction: 'advance',
  }, repository);

  if (!result.ok) {
    return timeline;
  }

  return result.value.timeline;
}

export function runSimulation(repository: InMemoryTimelineRepository, timeline: RecoveryTimeline) {
  const orchestrator = createOrchestrationSession();
  return orchestrator.run({
    timeline,
    dryRun: false,
    actor: 'planner',
    requestedAction: 'simulate',
  }, repository);
}
