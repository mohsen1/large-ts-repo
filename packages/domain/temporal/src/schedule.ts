import { Timestamp, Clock, CronInput, parseCron } from './clock';

export interface Job {
  id: string;
  name: string;
  payload: unknown;
}

export interface ScheduleDef {
  id: string;
  cron: CronInput;
  timezone: string;
  enabled: boolean;
}

export interface ExecutionAttempt {
  jobId: string;
  startedAt: Timestamp;
  finishedAt?: Timestamp;
  success: boolean;
  error?: string;
}

export class Schedule {
  private enabled = true;
  private attempts: ExecutionAttempt[] = [];

  constructor(private readonly clock: Clock, private readonly schedule: ScheduleDef, private readonly job: Job) {}

  isEnabled(): boolean { return this.enabled && this.schedule.enabled; }
  enable(value: boolean): void { this.enabled = value; }

  async run(): Promise<ExecutionAttempt> {
    const start = this.clock.now();
    try {
      await this.clock.sleep(1);
      const attempt: ExecutionAttempt = { jobId: this.job.id, startedAt: start, finishedAt: this.clock.now(), success: true };
      this.attempts.push(attempt);
      return attempt;
    } catch (error) {
      const attempt: ExecutionAttempt = {
        jobId: this.job.id,
        startedAt: start,
        finishedAt: this.clock.now(),
        success: false,
        error: String(error),
      };
      this.attempts.push(attempt);
      return attempt;
    }
  }

  getAttempts(): readonly ExecutionAttempt[] {
    return [...this.attempts];
  }
}

export function createCron(expression: string): CronInput {
  return parseCron(expression);
}
