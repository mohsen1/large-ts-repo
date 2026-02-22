import { normalizeWindow } from '@domain/recovery-drill/src/schema';
import type { DrillRunContext, DrillTemplate } from '@domain/recovery-drill';
import type { DrillStatus, DrillTemplateRecord, DrillRunRecord } from './models';
import { buildAgenda, toEnvelope, resolveWindow } from '@domain/recovery-drill/src/scheduling';

export const fromTemplate = (template: DrillTemplate): DrillTemplateRecord => ({
  tenantId: template.tenantId,
  templateId: template.id,
  template: {
    ...template,
    window: normalizeWindow(template.window),
  },
  archived: false,
  createdAt: new Date().toISOString(),
});

export const buildRunRecord = (
  template: DrillTemplate,
  context: DrillRunContext,
  status: DrillStatus,
): DrillRunRecord => {
  const agenda = buildAgenda(template, context);
  const window = resolveWindow(template.window, 120);
  return {
    id: context.runId,
    templateId: template.id,
    status,
    mode: context.mode,
    profile: {
      runId: context.runId,
      elapsedMs: 0,
      estimatedMs: agenda.totalDurationSeconds * 1000,
      queueDepth: agenda.expectedConcurrency,
      successRate: 0,
    },
    checkpoints: [],
    startedAt: window.startAt,
    endedAt: undefined,
    plan: JSON.stringify(toEnvelope(agenda, template.id)),
    context,
  };
};

export const isActive = (record: Pick<DrillRunRecord, 'status'>): boolean =>
  record.status === 'running' || record.status === 'queued' || record.status === 'paused';
