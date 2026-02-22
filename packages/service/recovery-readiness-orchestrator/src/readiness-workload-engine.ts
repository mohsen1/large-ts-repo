import { fail, ok, type Result } from '@shared/result';
import type { ReadinessPolicy } from '@domain/recovery-readiness';
import type { ReadinessReadModel } from '@data/recovery-readiness-store';
import { readModelHealths } from '@data/recovery-readiness-store';
import { MemoryReadinessRepository, type ReadinessRepository } from '@data/recovery-readiness-store';

export interface WorkloadLane {
  runId: string;
  owner: string;
  signalCount: number;
  directiveCount: number;
  riskScore: number;
}

export interface WorkloadAssessment {
  totalLanes: number;
  atRiskLanes: number;
  averageRisk: number;
}

export interface WorkloadEngineOptions {
  repo?: ReadinessRepository;
  policy: ReadinessPolicy;
}

export class ReadinessWorkloadEngine {
  private readonly repo: ReadinessRepository;
  private readonly policy: ReadinessPolicy;

  constructor(options: WorkloadEngineOptions) {
    this.repo = options.repo ?? new MemoryReadinessRepository();
    this.policy = options.policy;
  }

  async analyze(): Promise<Result<WorkloadAssessment, Error>> {
    const runs = await this.repo.listActive();
    if (runs.length === 0) {
      return ok({
        totalLanes: 0,
        atRiskLanes: 0,
        averageRisk: 0,
      });
    }

    const lanes = this.toLanes(runs);
    const atRisk = lanes.filter((lane) => lane.riskScore > 70).length;
    const averageRisk = Number((lanes.reduce((sum, lane) => sum + lane.riskScore, 0) / lanes.length).toFixed(2));
    return ok({
      totalLanes: lanes.length,
      atRiskLanes: atRisk,
      averageRisk,
    });
  }

  async scoreRun(runId: string): Promise<Result<number, Error>> {
    const lane = this.toLanes(await this.repo.listActive()).find((entry) => entry.runId === runId);
    if (!lane) {
      return fail(new Error('run-not-found'));
    }
    return ok(lane.riskScore);
  }

  private toLanes(runs: readonly ReadinessReadModel[]): WorkloadLane[] {
    const health = readModelHealths(runs);
    return runs.map((run) => {
      const entry = health.find((item) => item.runId === run.plan.runId);
      return {
        runId: run.plan.runId,
        owner: run.plan.metadata.owner,
        signalCount: run.signals.length,
        directiveCount: run.directives.length,
        riskScore: entry ? entry.score : 0,
      };
    });
  }

  getPolicyId(): string {
    return this.policy.policyId;
  }
}
