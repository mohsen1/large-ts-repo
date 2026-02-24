import { type WorkflowExecutionResult, type WorkflowExecutionStage, type WorkflowRenderModel } from '@domain/recovery-stress-lab';

export interface StageCardProps {
  readonly stage: string;
  readonly elapsed: number;
  readonly route: string;
}

export interface AdvancedWorkflowAlert {
  readonly level: 'info' | 'warning' | 'error';
  readonly heading: string;
  readonly details: string;
}

export interface AdvancedWorkflowDashboardModel {
  readonly runId: string;
  readonly tenantId: string;
  readonly riskSummary: {
    readonly stageCount: number;
    readonly traceCount: number;
    readonly hasRecommendations: boolean;
  };
  readonly stageCards: readonly StageCardProps[];
  readonly alerts: readonly AdvancedWorkflowAlert[];
}

export const buildDashboardModel = (result: WorkflowExecutionResult): AdvancedWorkflowDashboardModel => {
  const stages: StageCardProps[] = result.stages.map((stage: WorkflowExecutionStage) => ({
    stage: stage.stage,
    elapsed: stage.elapsedMs,
    route: stage.route,
  }));

  const alerts: AdvancedWorkflowAlert[] = result.recommendations.length > 0
    ? result.recommendations.map((recommendation, index) => ({
      level: index % 2 === 0 ? 'warning' : 'info',
      heading: `Recommendation ${index + 1}`,
      details: recommendation,
    }))
    : [
        {
          level: 'info',
          heading: 'No explicit recommendations',
          details: 'Workflow completed without recommendation events.',
        },
      ];

  return {
    runId: String(result.runId),
    tenantId: String(result.tenantId),
    riskSummary: {
      stageCount: result.stages.length,
      traceCount: result.traces.length,
      hasRecommendations: result.recommendations.length > 0,
    },
    stageCards: stages,
    alerts,
  };
};

export const buildSignalDigest = (result: WorkflowExecutionResult): readonly [string, number][] =>
  Object.entries(
    result.workspace.signals.reduce<Record<string, number>>((acc, signal) => {
      acc[signal.class] = (acc[signal.class] ?? 0) + 1;
      return acc;
    }, {}),
  );

export const summarizeRenderRows = (render: WorkflowRenderModel) => ({
  runId: render.runId,
  signalBuckets: render.riskBands,
  runbooks: render.runbookCount,
  totalSignals: render.signalCount,
  warningCount: render.recommendations.filter((recommendation: string) => recommendation.length > 0).length,
});
