import type { Result } from '@shared/result';
import { ok } from '@shared/result';
import type {
  OrchestratorState,
  RunPlan,
  StageExecution,
  PlaybookSelectionResult,
} from './model';

export interface ReportingSummary {
  totalRuns: number;
  running: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface RunReport {
  id: string;
  tenantId: string;
  playbookId: string;
  score: number;
  status: OrchestratorState['status'];
  plannedMinutes: number;
  completedMinutes: number;
  warningCount: number;
  stepCount: number;
  stageCount: number;
}

export interface ReportWindow {
  since: string;
  until: string;
}

export class Reporter {
  summarize(plans: readonly OrchestratorState[]): ReportingSummary {
    let totalRuns = 0;
    let running = 0;
    let completed = 0;
    let failed = 0;
    let cancelled = 0;
    for (const state of plans) {
      totalRuns += 1;
      if (state.status === 'running') running += 1;
      if (state.status === 'completed') completed += 1;
      if (state.status === 'failed') failed += 1;
      if (state.status === 'cancelled') cancelled += 1;
    }
    return {
      totalRuns,
      running,
      completed,
      failed,
      cancelled,
    };
  }

  report(plan: RunPlan, selection: PlaybookSelectionResult, state: OrchestratorState): RunReport {
    const selectedMinutes = state.stages.reduce((acc, item) => acc + this.estimateStageMinutes(item), 0);
    const elapsedMinutes = this.elapsedMinutes(state.run.createdAt, state.run.updatedAt);
    return {
      id: plan.id,
      tenantId: state.run.context.tenantId,
      playbookId: String(plan.playbookId),
      score: selection.score,
      status: state.status,
      plannedMinutes: plan.expectedMinutes,
      completedMinutes: Math.min(plan.expectedMinutes, Math.max(0, elapsedMinutes)),
      warningCount: selection.warnings.length,
      stepCount: selection.playbook.steps.length,
      stageCount: state.stages.length,
    };
  }

  window(started: ReportWindow, states: readonly OrchestratorState[]): Result<readonly RunReport[], string> {
    const since = Date.parse(started.since);
    const until = Date.parse(started.until);
    const filtered = states.filter((state) => {
      const startedAt = Date.parse(state.run.createdAt);
      return Number.isFinite(startedAt) && startedAt >= since && startedAt <= until;
    });
    const reports = filtered.map((state) => ({
      id: state.run.runId,
      tenantId: state.run.context.tenantId,
      playbookId: state.run.playbookId,
      score: 0.5,
      status: state.status,
      plannedMinutes: 0,
      completedMinutes: this.elapsedMinutes(state.run.createdAt, state.run.updatedAt),
      warningCount: 0,
      stepCount: state.stages.reduce((acc, stage) => acc + stage.completedSteps.length + stage.failedSteps.length, 0),
      stageCount: state.stages.length,
    }));
    return ok(reports);
  }

  private estimateStageMinutes(stage: StageExecution): number {
    return stage.completedSteps.length * 4 + stage.failedSteps.length * 10;
  }

  private elapsedMinutes(startAt: string, endAt: string): number {
    const start = Date.parse(startAt);
    const end = Date.parse(endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
    return Math.max(0, (end - start) / (60 * 1000));
  }
}

