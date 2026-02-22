import { JobScheduler } from './scheduler';

export interface RunnerHook {
  before(jobId: string): Promise<void>;
  after(jobId: string): Promise<void>;
}

export class Runner {
  constructor(private readonly scheduler: JobScheduler, private readonly hooks: readonly RunnerHook[] = []) {}

  async run(): Promise<number> {
    const jobs = await this.scheduler.flush();
    let ran = 0;
    for (const job of jobs) {
      for (const hook of this.hooks) await hook.before(job.id);
      await work(job);
      ran += 1;
      for (const hook of this.hooks) await hook.after(job.id);
    }
    return ran;
  }
}

async function work(job: { id: string; payload: Record<string, unknown> }): Promise<void> {
  await Promise.resolve(job);
}

export function start(runner: Runner): Promise<number> {
  return runner.run();
}
