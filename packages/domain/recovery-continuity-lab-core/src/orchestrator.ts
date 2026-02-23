import { ContinuityControlContext, ContinuityPlan, ContinuityRunResult, ContinuitySignal, UtcTimestamp } from './types';
import { summarizeTopology, summarizeMetrics } from './topology';
import { runBatchSimulations, summarizeSimulationOutcomes } from './simulator';
import { ContinuityLabService } from './service';

export interface OrchestrationInput {
  readonly context: ContinuityControlContext;
  readonly plans: ReadonlyArray<ContinuityPlan>;
  readonly signals: ReadonlyArray<ContinuitySignal>;
  readonly observedAt: UtcTimestamp;
}

export interface OrchestrationPlanResult {
  readonly contextSummary: ReturnType<typeof summarizeTopology>;
  readonly topologyMetrics: ReturnType<typeof summarizeMetrics>;
  readonly runs: ReadonlyArray<ContinuityRunResult>;
  readonly batchSummary: {
    readonly meanRisk: number;
    readonly maxCoverage: number;
    readonly violationCount: number;
  };
}

const service = new ContinuityLabService();

export const runContinuityOrchestration = async (input: OrchestrationInput): Promise<OrchestrationPlanResult> => {
  const contextSummary = summarizeTopology(input.context.topologyNodes, input.context.topologyEdges);
  const topologyMetrics = summarizeMetrics(input.context.topologyNodes, input.context.topologyEdges);
  const baseConfig = [
    { baseRisk: 0.5, signalThreshold: 0.01, constraintWeight: 0.15 },
    { baseRisk: 0.75, signalThreshold: 0.02, constraintWeight: 0.2 },
    { baseRisk: 1, signalThreshold: 0.05, constraintWeight: 0.35 },
  ];

  const runs = await Promise.all(
    input.plans.map(async (plan) => {
      const outcomes = runBatchSimulations(
        {
          context: input.context,
          plan,
          signals: input.signals,
          executedAt: input.observedAt,
        },
        baseConfig,
      );
      await service.run({
        context: input.context,
        plan,
        signals: input.signals,
        observedAt: input.observedAt,
      });
      return {
        scenarioId: plan.planId,
        planId: plan.planId,
        outcomes,
        diagnostics: [`plan=${plan.title}`, `signals=${plan.signals.length}`, `outcomes=${outcomes.length}`],
      };
    }),
  );

  const allOutcomes = runs.flatMap((run) => run.outcomes);
  const batchSummary = summarizeSimulationOutcomes(allOutcomes);
  return {
    contextSummary,
    topologyMetrics,
    runs,
    batchSummary,
  };
};

export const getPlanSummaryByRisk = (runs: ReadonlyArray<ContinuityRunResult>) => {
  return runs
    .map((run) => {
      const outcome = run.outcomes[0];
      return {
        planId: run.planId,
        risk: outcome?.risk ?? 0,
        violations: outcome?.violations.length ?? 0,
      };
    })
    .sort((left, right) => left.risk - right.risk);
};
