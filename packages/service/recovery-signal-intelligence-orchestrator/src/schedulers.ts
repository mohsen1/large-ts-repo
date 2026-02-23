import type {
  CampaignPlan,
  CampaignRun,
} from '@domain/recovery-signal-orchestration-models';
import {
  simulateSignalImpact,
  evaluateTimeline,
  summarizeSimulation,
  applySimulationToScore,
} from '@domain/recovery-signal-orchestration-models';

interface QueueItem {
  readonly plan: CampaignPlan;
  readonly run: CampaignRun;
  readonly nextPulseMinutes: number;
}

export interface SchedulerOutput {
  readonly executed: number;
  readonly completed: number;
  readonly deferred: number;
}

export class CampaignScheduler {
  private readonly queue: QueueItem[] = [];
  private readonly completed: CampaignRun[] = [];
  private readonly backlog: CampaignRun[] = [];

  enqueue(item: QueueItem): void {
    this.queue.push(item);
  }

  private popNext(nowMinutes = Date.now()): QueueItem | undefined {
    if (this.queue.length === 0) {
      return undefined;
    }

    const index = this.queue.reduce((acc, candidate, current) => {
      const eta = candidate.nextPulseMinutes;
      const next = this.queue[acc]?.nextPulseMinutes ?? Number.MAX_SAFE_INTEGER;
      return eta < next ? current : acc;
    }, 0);

    return this.queue.splice(index, 1)[0];
  }

  runTick(nowMinutes = 0): SchedulerOutput {
    const tickStart = nowMinutes || Date.now();
    let executed = 0;
    let completed = 0;
    let deferred = 0;

    let next = this.popNext();
    while (next) {
      const outcome = evaluateTimeline({
        runId: next.run.id,
        mode: next.plan.mode === 'burst' ? 'stress' : 'normal',
        timeline: next.plan.timeline,
        signals: next.plan.signals,
        noiseRatio: 0.12,
      });

      const report = summarizeSimulation(next.run, outcome);
      const nextRun: CampaignRun = {
        ...next.run,
        state: report.state,
        stepCursor: next.plan.timeline.length,
        completedSteps: next.plan.timeline.map((step) => step.sequence),
        score: applySimulationToScore(next.run.score, outcome),
        risk: report.completionRatio,
      };

      this.completed.push(nextRun);

      executed += 1;
      if (report.state === 'completed') {
        completed += 1;
      } else if (report.state === 'active') {
        deferred += 1;
      }

      next = tickStart > 0 ? this.popNext() : undefined;
    }

    return { executed, completed, deferred };
  }

  backlogRuns(): CampaignRun[] {
    return this.backlog;
  }

  completedRuns(): CampaignRun[] {
    return this.completed;
  }
}
