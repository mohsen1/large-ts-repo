import { fail, ok, type Result } from '@shared/result';
import { normalizeLimit } from '@shared/core';
import type {
  SimulationRepository,
  SimulationRepositoryPage,
  SimulationRepositoryQuery,
  SimulationArtifactEnvelope,
} from './types';
import type {
  SimulationCommand,
  SimulationPlanManifest,
  SimulationRunId,
  SimulationRunRecord,
  SimulationStepExecution,
  SimulationRunRecord as RunRecord,
} from '@domain/recovery-simulation-core';

export class InMemoryRecoverySimulationStore implements SimulationRepository {
  private readonly plans = new Map<SimulationPlanManifest['id'], SimulationPlanManifest>();
  private readonly runs = new Map<SimulationRunId, SimulationRunRecord>();
  private readonly steps = new Map<SimulationRunId, SimulationRunRecord['executedSteps']>();
  private readonly artifacts = new Map<string, SimulationArtifactEnvelope>();
  private readonly commands: SimulationCommand[] = [];

  async savePlan(plan: SimulationPlanManifest): Promise<boolean> {
    this.plans.set(plan.id, plan);
    return true;
  }

  async saveRun(run: SimulationRunRecord): Promise<boolean> {
    this.runs.set(run.id, run);
    this.steps.set(run.id, [...run.executedSteps]);
    return true;
  }

  async appendStep(runId: SimulationRunId, step: SimulationStepExecution): Promise<boolean> {
    const known = this.steps.get(runId) ?? [];
    this.steps.set(runId, [...known, step]);
    const run = this.runs.get(runId);
    if (!run) {
      return false;
    }
    await this.saveRun({
      ...run,
      executedSteps: [...run.executedSteps, step],
    });
    return true;
  }

  async recordCommand(command: SimulationCommand): Promise<boolean> {
    this.commands.push(command);
    return true;
  }

  async appendArtifact(artifact: SimulationArtifactEnvelope): Promise<boolean> {
    const key = `${artifact.runId}:${artifact.artifactKind}:${artifact.snapshotId}`;
    this.artifacts.set(key, artifact);
    return true;
  }

  async getRun(runId: SimulationRunId): Promise<SimulationRunRecord | undefined> {
    return this.runs.get(runId);
  }

  async queryRuns(query: SimulationRepositoryQuery): Promise<SimulationRepositoryPage> {
    const limit = normalizeLimit(query.limit);
    const all = [...this.runs.values()].filter((run) => {
      if (query.runId && run.id !== query.runId) return false;
      if (query.scenarioId && run.scenarioId !== query.scenarioId) return false;
      if (query.state && run.state !== query.state) return false;
      return true;
    });

    const start = Number.parseInt(query.cursor ?? '0', 10) || 0;
    const items = all.slice(start, start + limit);
    return {
      items,
      total: all.length,
      hasMore: start + limit < all.length,
      nextCursor: start + limit < all.length ? `${start + limit}` : undefined,
    };
  }

  async queryByScenario(scenarioId: string): Promise<Result<readonly SimulationRunRecord[], Error>> {
    const matches = [...this.runs.values()].filter((run) => run.scenarioId === scenarioId);
    if (matches.length === 0) {
      return fail(new Error(`no runs for scenario ${scenarioId}`));
    }
    return ok(matches);
  }
}
