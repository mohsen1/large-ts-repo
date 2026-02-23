import { InMemoryTimelineRepository, TimelineFilter } from '@data/recovery-timeline-store';
import { ForecastEnvelope, RecoveryTimeline } from '@domain/recovery-timeline';
import { RecoveryTimelineOrchestrator, createOrchestrationSession } from '@service/recovery-timeline-orchestrator';

const repository = new InMemoryTimelineRepository();

export function seedRepository(timelines: RecoveryTimeline[]): void {
  timelines.forEach((timeline) => {
    repository.save(timeline);
  });
}

export function listTimelines(filter: TimelineFilter = {}): RecoveryTimeline[] {
  return repository.query(filter);
}

export function getTimeline(id: string): RecoveryTimeline | undefined {
  const loaded = repository.load(id);
  return loaded.ok ? loaded.value : undefined;
}

export function buildForecast(id: string): ForecastEnvelope | undefined {
  const orchestrator = createOrchestrationSession();
  const loaded = repository.load(id);
  if (!loaded.ok) {
    return undefined;
  }
  const command = {
    timeline: loaded.value,
    actor: 'timeline-studio',
    requestedAction: 'simulate' as const,
    dryRun: true,
  };
  const result = orchestrator.run(command, repository);
  return result.ok ? result.value.forecast : undefined;
}

export function applyAdvance(id: string): RecoveryTimeline | undefined {
  const orchestrator = createOrchestrationSession();
  const loaded = repository.load(id);
  if (!loaded.ok) {
    return undefined;
  }
  const run = orchestrator.run(
    {
      timeline: loaded.value,
      actor: 'timeline-studio-operator',
      requestedAction: 'advance',
      dryRun: false,
    },
    repository,
  );
  if (!run.ok) {
    return undefined;
  }
  return run.value.timeline;
}

export function resolveRepository(): InMemoryTimelineRepository {
  return repository;
}
