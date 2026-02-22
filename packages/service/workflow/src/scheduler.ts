import { WorkflowDef } from '@domain/workflow';

export interface Scheduled {
  id: string;
  defId: string;
  cron: string;
  lastRun?: string;
}

const jobs = new Map<string, Scheduled>();

export const schedule = (def: WorkflowDef, cron: string): Scheduled => {
  const scheduled: Scheduled = { id: `wf-sched-${def.id}`, defId: def.id as string, cron };
  jobs.set(scheduled.id, scheduled);
  return scheduled;
};

export const allSchedules = (): Scheduled[] => Array.from(jobs.values());

export const isDue = (value: Scheduled): boolean => value.lastRun == null;

export const markRun = (id: string): void => {
  const next = jobs.get(id);
  if (!next) return;
  jobs.set(id, { ...next, lastRun: new Date().toISOString() });
};
