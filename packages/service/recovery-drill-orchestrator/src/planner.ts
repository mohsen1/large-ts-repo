import { buildAgenda } from '@domain/recovery-drill/src/scheduling';
import type { DrillRunContext, DrillTemplate } from '@domain/recovery-drill';
import type { DrillRunPlan } from './types';

export interface PlannerInput {
  context: DrillRunContext;
  template: DrillTemplate;
  activeRuns: number;
}

export const buildPlan = ({ context, template, activeRuns }: PlannerInput): DrillRunPlan => {
  const agenda = buildAgenda(template, context);
  const scenarioOrder = agenda.timeline.map((entry) => entry.scenarioId);
  const concurrency = Math.min(3, Math.max(1, Math.ceil(activeRuns / 2)));
  return {
    runId: context.runId,
    templateId: template.id,
    scenarioOrder,
    concurrency,
    estimatedMs: agenda.totalDurationSeconds * 1000,
  };
};
