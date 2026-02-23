import { randomUUID } from 'node:crypto';
import {
  selectPlan,
  buildPlanSummaries,
  summarizePolicy,
  simulateExecution,
  type CommandSelectionCriteria,
  type CommandSurface,
  type CommandPlanSummary,
  type CommandOrchestrationResult,
} from '@domain/recovery-ops-orchestration-surface';
import { RecoveryOpsOrchestrationStore } from '@data/recovery-ops-orchestration-store';
import { isOk, ok, fail, type Result } from '@shared/result';
import type { OrchestrationGateway } from './adapters';

export interface OrchestrationRunContext {
  readonly correlationId: string;
  readonly requestedBy: string;
}

export interface OrchestrationWorkspace {
  readonly surface: CommandSurface;
  readonly criteria: CommandSelectionCriteria;
}

interface BuildContextResult {
  readonly selection: CommandOrchestrationResult;
  readonly summaries: readonly CommandPlanSummary[];
  readonly timeline: ReturnType<typeof simulateExecution>;
}

export const buildOrchestrationRun = (
  workspace: OrchestrationWorkspace,
): BuildContextResult => {
  const policy = {
    requiresApproval: workspace.criteria.minConfidence > 0.9,
    maxConcurrentCommands: Math.max(1, workspace.criteria.maxPlanMinutes / 8),
    maxRiskLevel: workspace.criteria.riskTolerance,
  };

  const confidenceSamples = workspace.surface.signals.map((signal) => signal.confidence);
  const averageConfidence = confidenceSamples.length
    ? confidenceSamples.reduce((acc, value) => acc + value, 0) / confidenceSamples.length
    : 0;

  const planSummaries = buildPlanSummaries(workspace.surface);
  const selected = selectPlan(workspace.surface, workspace.criteria);

  const selectedPlan = workspace.surface.availablePlans.find((plan) => plan.id === selected.chosenPlanId);
  const fallbackPlan = workspace.surface.availablePlans[0];
  const summaries = planSummaries.map((plan) => ({
    id: plan.id,
    score: plan.score,
    risk: plan.risk,
    durationMinutes: plan.durationMinutes,
  }));

  const timeline = simulateExecution(workspace.surface, selected);

  return {
    selection: {
      ...selected,
      blockers: [
        ...selected.blockers,
        ...(
          selectedPlan || fallbackPlan
            ? summarizePolicy(
                selectedPlan ?? fallbackPlan!,
                {
                  ...policy,
                  maxRiskLevel: workspace.criteria.riskTolerance,
                },
                averageConfidence,
              ).reasons
            : []
        ),
      ],
    },
    summaries,
    timeline,
  };
};

export class RecoveryOpsOrchestrationEngine {
  constructor(
    private readonly store: RecoveryOpsOrchestrationStore,
    private readonly gateway: OrchestrationGateway,
  ) {}

  async run(workspace: OrchestrationWorkspace, context: OrchestrationRunContext): Promise<Result<BuildContextResult, Error>> {
    try {
      const persistedSurface = await this.gateway.persistSurface(workspace.surface);
      if (!isOk(persistedSurface)) {
        return fail(new Error('Failed to persist surface'));
      }

      const output = buildOrchestrationRun(workspace);
      const record = await this.gateway.publishSelection(output.selection);
      if (!isOk(record)) {
        return fail(new Error('Failed to publish selection'));
      }

      const summary = this.store.snapshot();
      this.store.searchRuns({
        tenantId: workspace.surface.tenantId,
        scenarioId: workspace.surface.scenarioId,
        limit: 10,
      });

      return ok({
        ...output,
        timeline: {
          ...output.timeline,
          planId: `${output.selection.chosenPlanId}-${context.correlationId ?? randomUUID()}`,
        },
      });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('orchestration-failed'));
    }
  }
}
