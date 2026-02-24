import type { ConvergencePlan, ConvergenceRunEvent, ConvergenceWorkspace } from './types';
import { ConvergenceWorkspaceService } from './service';

export interface ConvergenceWorkspaceInsight {
  readonly workspaceId: string;
  readonly planCount: number;
  readonly avgScore: number;
  readonly topPlanId: ConvergencePlan['id'] | undefined;
  readonly topTags: readonly string[];
  readonly risk: 'low' | 'medium' | 'high';
}

export interface ConvergenceInsights {
  readonly workspace: ConvergenceWorkspaceInsight;
  readonly signals: readonly string[];
  readonly timeline: readonly string[];
}

export class ConvergenceInsightEngine {
  readonly #service = new ConvergenceWorkspaceService();

  private summarizeRuns(events: readonly ConvergenceRunEvent[]): readonly string[] {
    const sorted = events.toSorted((left, right) => left.at.localeCompare(right.at));
    const timeline: string[] = [];
    for (const [index, event] of sorted.entries()) {
      timeline.push(`${index}:${event.at}|${event.type}/${event.phase ?? 'unknown'}`);
    }
    return timeline;
  }

  async insight(workspace: ConvergenceWorkspace): Promise<ConvergenceInsights> {
    const ordered = ConvergenceWorkspaceService.planSequence(workspace);
    const topPlan = ordered[0];
    const avgScore = ordered.length === 0 ? 0 : ordered.reduce((acc, plan) => acc + plan.score, 0) / ordered.length;
    const run = await this.#service.summarize(workspace, ordered);
    const highRisk = run.events.some((entry) => entry.type === 'error') || avgScore < 20;

    return {
      workspace: {
        workspaceId: workspace.id,
        planCount: ordered.length,
        avgScore,
        topPlanId: topPlan?.id,
        topTags: this.tagsForWorkspace(workspace),
        risk: highRisk ? 'high' : avgScore > 70 ? 'low' : 'medium',
      },
      signals: workspace.signals.map((signal) => `${signal.source}:${signal.tier}`),
      timeline: this.summarizeRuns(run.events),
    };
  }

  private tagsForWorkspace(workspace: ConvergenceWorkspace): readonly string[] {
    const tags: string[] = [];
    for (const signal of workspace.signals) {
      for (const tag of signal.tags) {
        tags.push(`${tag.key}=${tag.value}`);
      }
    }
    return tags;
  }
}

export const buildInsightForWorkspace = async (workspace: ConvergenceWorkspace): Promise<ConvergenceInsights> => {
  const engine = new ConvergenceInsightEngine();
  return engine.insight(workspace);
};
