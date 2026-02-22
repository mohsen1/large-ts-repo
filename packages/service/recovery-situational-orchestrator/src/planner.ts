import { buildPlanFromContext, summarizeAssessment, parseAssessment } from '@domain/recovery-situational-intelligence';
import type {
  OrchestrateRequest,
  OrchestrateResponse,
  OrchestratorPort,
  CommandCenterState,
  TelemetryPulse,
} from './types';
import { createSituationalStore } from '@data/recovery-situational-store';
import type { Result } from '@shared/result';

const repository = createSituationalStore();
const now = () => new Date().toISOString();

const safe = <T>(work: () => Promise<T>): Promise<Result<T, string>> =>
  work()
    .then((value) => ({ ok: true as const, value }))
    .catch((error: unknown): Result<T, string> => ({ ok: false as const, error: error instanceof Error ? error.message : 'unknown error' }));

export class RecoverySituationalOrchestrator implements OrchestratorPort {
  private state: CommandCenterState = {
    activeAssessmentIds: [],
    telemetry: {
      workloadNodeId: 'none',
      assessmentsCount: 0,
      activeSignals: 0,
      planCoverage: 0,
      averageConfidence: 0,
    },
  };

  async run(request: OrchestrateRequest): Promise<OrchestrateResponse> {
    const assessment = buildPlanFromContext(request.node, request.snapshot, request.signals, request.context, {
      selector: (plans) => [...plans].sort((left, right) => right.confidence - left.confidence)[0],
    });
    const saved = await repository.saveAssessment(assessment);
    await repository.writePlan(assessment.plan);

    this.state = {
      ...this.state,
      activeAssessmentIds: [...this.state.activeAssessmentIds, saved.id],
      lastAssessmentAt: now(),
      telemetry: {
        ...this.state.telemetry,
        workloadNodeId: request.node.nodeId,
        assessmentsCount: this.state.telemetry.assessmentsCount + 1,
        averageConfidence: Number(
          (this.state.telemetry.averageConfidence * 0.5 + saved.assessment.weightedConfidence * 0.5).toFixed(4),
        ),
      },
    };

    return {
      assessment: saved.assessment,
      mode: request.mode,
      persisted: true,
    };
  }

  async runBatch(requests: readonly OrchestrateRequest[]): Promise<readonly OrchestrateResponse[]> {
    const output: OrchestrateResponse[] = [];
    for (const request of requests) {
      output.push(await this.run(request));
    }
    return output;
  }

  async resolve(assessmentId: string): Promise<void> {
    const assessment = await repository.getAssessment(assessmentId);
    if (!assessment) {
      return;
    }
    this.state = {
      ...this.state,
      activeAssessmentIds: this.state.activeAssessmentIds.filter((id) => id !== assessmentId),
      telemetry: {
        ...this.state.telemetry,
        assessmentsCount: Math.max(0, this.state.telemetry.assessmentsCount - 1),
      },
    };
  }

  async summarize(nodeId: string): Promise<readonly TelemetryPulse[]> {
    const plans = await repository.listPlans(nodeId);
    const assessments = await repository.listAssessments({ workloadNodeIds: [nodeId], onlyActive: true });
    const parsed = await Promise.allSettled(
      assessments.map((entry) =>
        safe(async () => {
          const parsedAssessment = parseAssessment(entry.assessment);
          return summarizeAssessment(parsedAssessment);
        }),
      ),
    );

    const valid = parsed.flatMap((entry) => {
      if (entry.status === 'rejected' || !entry.value.ok) {
        return [];
      }
      return [
        {
          label: `active-${entry.value.value}`,
          value: plans.length + assessments.length,
          trend: plans.length > assessments.length ? 'up' : plans.length < assessments.length ? 'down' : ('flat' as const),
        } satisfies TelemetryPulse,
      ];
    });

    return valid.map((item): TelemetryPulse => ({
      ...item,
      value: item.value % 100,
    }));
  }
}

export const runSituationalPlanning = (orchestrator: OrchestratorPort, request: OrchestrateRequest): Promise<OrchestrateResponse> => {
  return orchestrator.run(request);
};

export const runSituationalBatchPlanning = (
  orchestrator: OrchestratorPort,
  requests: readonly OrchestrateRequest[],
): Promise<readonly OrchestrateResponse[]> => {
  return orchestrator.runBatch(requests);
};
