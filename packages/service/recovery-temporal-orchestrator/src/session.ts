import { isoNow } from '@shared/temporal-ops-runtime';
import type {
  PlanCandidate,
  OrchestrationPlan,
} from '@domain/recovery-temporal-orchestration/planner';

export interface RuntimeSessionOptions {
  readonly actor: string;
  readonly budgetMs: number;
}

export interface RuntimeSessionState {
  readonly startedAt: string;
  readonly actor: string;
  readonly budgetMs: number;
  readonly planRuns: number;
  readonly heartbeat: readonly string[];
}

export class RuntimeSession {
  readonly #options: RuntimeSessionOptions;
  readonly #heartbeats: string[] = [];
  #runs = 0;

  constructor(options: RuntimeSessionOptions) {
    this.#options = options;
  }

  markHeartbeat(event: string): void {
    const stamp = `${isoNow()}#${event}`;
    this.#heartbeats.push(stamp);
  }

  trackPlan<TMeta>(plan: OrchestrationPlan<TMeta>): void {
    this.#runs += 1;
    this.markHeartbeat(`plan:${plan.id}`);
  }

  runCount(): number {
    return this.#runs;
  }

  inspect<TMeta>(plan: OrchestrationPlan<TMeta>): RuntimeSessionState {
    return {
      startedAt: isoNow(),
      actor: this.#options.actor,
      budgetMs: this.#options.budgetMs,
      planRuns: this.#runs,
      heartbeat: this.#heartbeats.toSorted(),
    };
  }

  pickCandidates(candidates: readonly PlanCandidate[]): readonly PlanCandidate[] {
    return candidates.toSorted((left, right) =>
      left.budgetMs === right.budgetMs ? left.nodeCount - right.nodeCount : left.budgetMs - right.budgetMs,
    );
  }

  [Symbol.dispose](): void {
    this.#heartbeats.length = 0;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await Promise.resolve();
    this.#heartbeats.length = 0;
  }
}

export const createSession = (actor: string, budgetMs = 30_000): RuntimeSession =>
  new RuntimeSession({ actor, budgetMs });
