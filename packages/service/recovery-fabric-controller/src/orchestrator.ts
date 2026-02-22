import type {
  FabricPlan,
  FabricPlanSelection,
  FabricExecutionContext,
  FabricPolicy,
  FabricRun,
  FabricRun as FabricRunType,
} from '@domain/recovery-fabric-orchestration';
import { selectCommands, selectCommandMap, rankByBlastRadius, rankByPriority } from '@domain/recovery-fabric-orchestration';
import { decidePolicy, estimateReadinessLevel, estimateRiskBand } from '@domain/recovery-fabric-orchestration';
import { buildRunTimeline, optimizeTimeline, validateRunTimeline } from '@domain/recovery-fabric-orchestration';
import { analyzePlan } from '@domain/recovery-fabric-orchestration';
import type { FabricReadinessLevel } from '@domain/recovery-fabric-orchestration';

export interface OrchestrationInput {
  readonly plan: FabricPlan;
  readonly policy: FabricPolicy;
  readonly context: FabricExecutionContext;
  readonly availableWindows: readonly { readonly window: FabricExecutionContext['program']['window'] }[];
}

export interface OrchestratorOutput {
  readonly allowed: boolean;
  readonly selections: readonly FabricPlanSelection[];
  readonly timeline: ReturnType<typeof buildRunTimeline>;
  readonly decision: ReturnType<typeof decidePolicy>;
  readonly analytics: ReturnType<typeof analyzePlan>;
  readonly run: FabricRun | null;
  readonly summary: {
    readonly commandCount: number;
    readonly readinessBand: FabricReadinessLevel;
    readonly riskBand: ReturnType<typeof estimateRiskBand>;
  };
  readonly warnings: readonly string[];
}

export const orchestratePlan = (input: OrchestrationInput): OrchestratorOutput => {
  const ordered = rankByPriority(rankByBlastRadius(input.plan.commands));
  const commandMap = selectCommandMap(ordered);
  const selections = selectCommands(ordered, input.context, input.policy, Math.min(ordered.length, 20));
  const decision = decidePolicy(input.policy, input.context, ordered);
  const selectedCommandIds = selections.filter((selection) => selection.selected).map((selection) => selection.command.id);

  const runId = `run-${Date.now()}` as never;
  const run: FabricRunType | null = decision.approved
    ? {
      id: runId,
      tenantId: input.context.tenantId,
      fabricId: input.context.fabricId,
      policyId: input.policy.id,
      incidentId: input.context.incident.id,
      commandIds: selectedCommandIds,
      startedAt: new Date().toISOString(),
      status: 'queued',
      readinessBand: decision.readiness,
      riskBand: decision.riskBand,
      windows: input.availableWindows.map((entry) => entry.window as never),
    }
    : null;

  const timeline = run
    ? buildRunTimeline(run.id, { ...input.plan, commands: ordered }, input.availableWindows.map((entry) => entry.window as never))
    : { run: runId, slots: [], totalSlots: 0, totalDurationMinutes: 0 };

  const optimizedTimeline = optimizeTimeline(timeline);
  const validTimeline = run ? validateRunTimeline(optimizedTimeline) : false;

  const analysisPlan = analyzePlan(input.policy, commandMap, input.plan);
  const readiness = estimateReadinessLevel(ordered);
  const risk = estimateRiskBand(
    readiness,
    input.policy.maxRetries,
    ordered.reduce((count, command) => count + command.requiresApprovals, 0),
  );

  const warnings = [
    ...analysisPlan.warnings,
    ...input.plan.topology.edges.filter((edge) => edge.mandatory).map((edge) => `${edge.from}->${edge.to} mandatory`),
    validTimeline ? '' : 'timeline invalid',
    risk === 'black' ? 'black risk band' : '',
  ].filter(Boolean);

  return {
    allowed: Boolean(run && decision.approved && validTimeline),
    selections,
    timeline: optimizedTimeline,
    decision,
    analytics: analysisPlan,
    run,
    summary: {
      commandCount: selectedCommandIds.length,
      readinessBand: decision.readiness,
      riskBand: risk,
    },
    warnings,
  };
};

export const orchestrateByPolicy = (
  plans: readonly FabricPlan[],
  policy: FabricPolicy,
  context: FabricExecutionContext,
  availableWindows: OrchestrationInput['availableWindows'],
): OrchestratorOutput[] => {
  return plans.map((plan) => orchestratePlan({ plan, policy, context, availableWindows }));
};
