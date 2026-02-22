import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import {
  runAndEmitSimulationEvents,
  type SimulationInput,
  type SimulationSummary,
  parseSimulationProfile,
  type ReadinessState,
} from '@domain/recovery-simulation-planning';
import { InMemorySimulationMetricsRepository, type RecoverySimulationMetricsRepository } from '@data/recovery-simulation-metrics';
import { createSimulationRecord } from './simulation-translation';

export interface ReadinessAssessment {
  readonly readinessScore: number;
  readonly signalCount: number;
  readonly riskTier: 'low' | 'medium' | 'high';
  readonly notes: readonly string[];
}

export interface ReadinessPlan {
  readonly input: SimulationInput;
  readonly workspaceId: string;
  readonly planScore: number;
  readonly summary: SimulationSummary;
}

export interface ReadinessContext {
  readonly tenant: string;
  readonly owner: string;
  readonly strategy: 'safe' | 'agile';
}

export class SimulationReadinessEngine {
  private readonly metricsRepository: RecoverySimulationMetricsRepository;

  constructor(
    private readonly context: ReadinessContext,
    metricsRepository?: RecoverySimulationMetricsRepository,
  ) {
    this.metricsRepository = metricsRepository ?? new InMemorySimulationMetricsRepository();
  }

  async evaluate(input: SimulationInput, workspaceId: string): Promise<Result<ReadinessAssessment, Error>> {
    const parsedProfile = parseSimulationProfile({
      ...input.profile,
      id: input.profile.id,
      runId: input.profile.runId,
    });

    const result = runAndEmitSimulationEvents({ ...input, profile: parsedProfile });
    if (!result.ok) {
      return fail(result.error);
    }

    const record = createSimulationRecord(result.value.summary, result.value.telemetry, workspaceId, this.context.tenant);
    await this.metricsRepository.append(record);

    const score = result.value.summary.score;
    const riskTier: ReadinessAssessment['riskTier'] =
      score >= 75 ? 'low' : score >= 40 ? 'medium' : 'high';

    return ok({
      readinessScore: score,
      signalCount: result.value.telemetry.length,
      riskTier,
      notes: [
        `tenant=${this.context.tenant}`,
        `owner=${this.context.owner}`,
        `strategy=${this.context.strategy}`,
        `status=${result.value.summary.status}`,
      ],
    });
  }

  async buildPlan(input: SimulationInput, workspaceId: string): Promise<Result<ReadinessPlan, Error>> {
    const assessment = await this.evaluate(input, workspaceId);
    if (!assessment.ok) return fail(assessment.error);

    const readState: ReadinessState = assessment.value.riskTier === 'high' ? 'failed' : 'drained';

    const snapshot: SimulationSummary = {
      id: input.profile.id,
      status: assessment.value.riskTier === 'low' ? 'ok' : 'degraded',
      score: assessment.value.readinessScore,
      scenarioId: input.profile.scenario.id,
      readinessState: readState,
      failureCount: assessment.value.signalCount,
      recommendedActions: assessment.value.notes,
    };

    return ok({
      input,
      workspaceId,
      planScore: assessment.value.readinessScore,
      summary: snapshot,
    });
  }
}

export const readinessSignal = (assessment: ReadinessAssessment): string => {
  if (assessment.riskTier === 'low') return 'proceed';
  if (assessment.riskTier === 'medium') return 'monitor';
  return 'pause';
};
