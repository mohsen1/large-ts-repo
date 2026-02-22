import { Invoice } from '@domain/billing';
import { InvoiceCommand, BillingCommand } from '@domain/billing';

export type Action = 'collect' | 'remind' | 'close';

export interface Job {
  id: string;
  action: Action;
  dueAt: string;
  invoice: Invoice['id'];
}

const jobs: Job[] = [];

export const enqueue = (job: Job): Job[] => {
  return [...jobs, job];
};

export const schedule = (invoice: Invoice, action: Action, minutes: number): Job => {
  const job: Job = {
    id: `${invoice.id}-${action}`,
    action,
    dueAt: new Date(Date.now() + minutes * 60_000).toISOString(),
    invoice: invoice.id,
  };
  jobs.push(job);
  return job;
};

export const nextDue = (): Job[] => {
  const now = Date.now();
  return jobs
    .filter((job) => Date.parse(job.dueAt) <= now)
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt));
};

export const run = (onJob: (job: Job) => Promise<void>): Promise<void[]> =>
  Promise.all(nextDue().map((job) => onJob(job)));
