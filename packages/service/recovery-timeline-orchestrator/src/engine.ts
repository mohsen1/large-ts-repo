import { Result } from '@shared/result';
import { InMemoryTimelineRepository } from '@data/recovery-timeline-store';
import type { ForecastEnvelope, RecoveryTimeline, RecoveryTelemetrySnapshot } from '@domain/recovery-timeline';
import { forecastRecoveryCompletion } from '@domain/recovery-timeline';
import { aggregateHealth } from '@domain/recovery-timeline';
import { DEFAULT_ORCHESTRATION_POLICY, OrchestrationInput, OrchestrationPolicy, OrchestrationResult } from './types';

export function createOrchestrationSession(policy: OrchestrationPolicy = DEFAULT_ORCHESTRATION_POLICY): RecoveryTimelineOrchestrator {
  return new RecoveryTimelineOrchestrator(policy);
}

export class RecoveryTimelineOrchestrator {
  constructor(private readonly policy: OrchestrationPolicy) {}

  run(input: OrchestrationInput, repository: InMemoryTimelineRepository): Result<OrchestrationResult> {
    const load = repository.load(input.timeline.id);
    if (!load.ok) {
      return { ok: false, error: load.error };
    }

    const timeline = input.requestedAction === 'advance' ? this.advance(load.value, input.actor) : load.value;
    if (timeline.events.length < this.policy.minRecoveryEvents) {
      return { ok: false, error: new Error('insufficient events to run orchestration') };
    }

    const snapshot = this.buildSnapshot(timeline, input.actor);
    if (input.requestedAction === 'simulate') {
      const forecast = this.forecast(load.value);
      return { ok: true, value: { timeline: load.value, snapshot, forecast } };
    }

    if (!input.dryRun) {
      repository.save(timeline, snapshot);
    }

    return {
      ok: true,
      value: {
        timeline,
        snapshot,
        warning: this.computeWarning(timeline),
      },
    };
  }

  private advance(timeline: RecoveryTimeline, actor: string): RecoveryTimeline {
    const events = timeline.events.map((event) => ({
      ...event,
      state: event.state === 'failed' && !this.policy.failureTolerance ? event.state : this.nextEventState(event.state),
    }));

    const nextTimeline = {
      ...timeline,
      ownerTeam: timeline.ownerTeam,
      events,
      updatedAt: new Date(),
    };

    if (actor.length === 0) {
      nextTimeline.name = `${nextTimeline.name} (system)`;
    }

    return nextTimeline;
  }

  private forecast(timeline: RecoveryTimeline): ForecastEnvelope {
    return forecastRecoveryCompletion(timeline);
  }

  private buildSnapshot(timeline: RecoveryTimeline, actor: string): RecoveryTelemetrySnapshot {
    const forecast = forecastRecoveryCompletion(timeline);
    return {
      timelineId: timeline.id,
      source: actor,
      measuredAt: new Date(),
      confidence: Math.max(40, 100 - timeline.events.length * 3),
      expectedReadyAt: forecast.events.at(-1)?.end ?? new Date(),
      actualReadyAt: timeline.events.every((event) => event.state === 'completed') ? new Date() : undefined,
      note: `snapshot from ${actor} for ${timeline.name}`,
    };
  }

  private computeWarning(timeline: RecoveryTimeline): string | undefined {
    const risk = aggregateHealth(timeline.events);
    return risk.failureRate > this.policy.riskClampMax ? 'risk score threshold exceeded' : undefined;
  }

  private nextEventState(current: RecoveryTimeline['events'][number]['state']): RecoveryTimeline['events'][number]['state'] {
    if (current === 'queued') return 'running';
    if (current === 'running') return 'completed';
    return current;
  }
}
