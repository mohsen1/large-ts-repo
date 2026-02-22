import { Tracer, TraceSpan } from '@domain/observability-core/traces';

export interface JobEnvelope {
  id: string;
  payload: Record<string, unknown>;
}

export interface JobScheduler {
  schedule(job: JobEnvelope): Promise<void>;
  flush(): Promise<JobEnvelope[]>;
}

export class InMemoryScheduler implements JobScheduler {
  private queue: JobEnvelope[] = [];

  async schedule(job: JobEnvelope): Promise<void> {
    this.queue.push(job);
  }

  async flush(): Promise<JobEnvelope[]> {
    const out = this.queue;
    this.queue = [];
    return out;
  }
}

export class TracedScheduler extends InMemoryScheduler {
  constructor(private readonly tracer: Tracer) { super(); }

  async schedule(job: JobEnvelope): Promise<void> {
    const span = this.tracer.startTrace(job.id, 'schedule');
    await super.schedule(job);
    this.tracer.annotate(span, 'job', job.id);
    this.tracer.finish(span);
  }
}

export async function scheduleMany(scheduler: JobScheduler, jobs: readonly JobEnvelope[]): Promise<void> {
  for (const job of jobs) {
    await scheduler.schedule(job);
  }
}
