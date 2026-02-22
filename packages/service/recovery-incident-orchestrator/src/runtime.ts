import {
  type IncidentPlan,
  type OrchestrationRun,
  type IncidentRecord,
  type IncidentId,
  canApprove,
  createPlan,
} from '@domain/recovery-incident-orchestration';
import type { IncidentQuery } from '@data/recovery-incident-store';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { routeExecutionBatches, topologicalOrder } from '@domain/recovery-incident-orchestration';

export interface OrchestratorDependencies {
  readonly repo: RecoveryIncidentRepository;
  readonly clock?: () => string;
}

export interface OrchestrateResult {
  readonly plan: IncidentPlan;
  readonly runs: readonly OrchestrationRun[];
  readonly approved: boolean;
}

export class RecoveryIncidentOrchestrator {
  private readonly repo: RecoveryIncidentRepository;
  private readonly clock: () => string;

  constructor(deps: OrchestratorDependencies) {
    this.repo = deps.repo;
    this.clock = deps.clock ?? (() => new Date().toISOString());
  }

  async upsertIncident(incident: IncidentRecord): Promise<void> {
    await this.repo.upsertIncident(incident);
  }

  async planForIncident(incidentId: IncidentId, eventSeed: string): Promise<IncidentPlan | undefined> {
    const incidents = await this.repo.findIncidents({ limit: 100 });
    const incident = incidents.data.find((entry) => entry.id === incidentId);
    if (!incident) {
      return undefined;
    }

    const plan = createPlan(incident, eventSeed) as IncidentPlan;
    await this.repo.addPlan(plan);
    return plan;
  }

  async executeIncidentPlan(plan: IncidentPlan): Promise<OrchestrateResult> {
    const approved = canApprove(plan);
    const runSeed = this.clock();
    const sorted = topologicalOrder(plan.route);
    const batches = routeExecutionBatches(plan.route, 2);
    const runs: OrchestrationRun[] = [];

    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
      const batch = batches[batchIndex];
      const runPromises = batch.map(async (nodeId, index) => {
        const order = sorted.findIndex((id) => id === nodeId);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, (Math.max(1, batchIndex) * 25 + index * 7) * 5);
        });
        const run: OrchestrationRun = {
          id: `${plan.id}:run:${batchIndex}:${order}` as any,
          planId: plan.id,
          nodeId,
          state: approved ? 'done' : 'pending',
          startedAt: this.clock(),
          finishedAt: this.clock(),
          output: {
            runSeed,
            approved,
            batch: batchIndex,
            order,
          },
        };
        await this.repo.addRuns(plan.incidentId, run);
        return run;
      });
      const batchRuns = await Promise.all(runPromises);
      runs.push(...batchRuns);
    }

    return {
      plan,
      runs,
      approved,
    };
  }

  async orchestrateForQuery(query: IncidentQuery): Promise<OrchestrateResult[]> {
    const incidents = await this.repo.findIncidents(query);
    const outputs: OrchestrateResult[] = [];
    for (const incident of incidents.data) {
      const plan = await this.planForIncident(incident.id, `${query.tenantId ?? 'tenant'}:${query.region ?? 'region'}`);
      if (!plan) {
        continue;
      }
      const result = await this.executeIncidentPlan(plan);
      outputs.push(result);
    }
    return outputs;
  }
}
