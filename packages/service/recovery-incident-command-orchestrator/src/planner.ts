import {
  CommandDefinition,
  CommandPlan,
  CommandWindow,
  SimulationResult,
  assignStepOrder,
  buildTimeline,
  evaluateConstraints,
  isPlanBlockable,
  summarizeConstraintMessages,
  rankCommands,
  overlapFraction,
  aggregateDemand,
  type SimulatedImpact,
  type RecoveryCommand,
} from '@domain/incident-command-models';
import { ok, fail } from '@shared/result';
import type { Result } from '@shared/result';
import type {
  OrchestrationCommandInput,
  OrchestrationContext,
  PlanDraft,
  CandidateCommand,
  SimulationInput,
  SimulationRun,
} from './types';

const toContext = (input: OrchestrationCommandInput): OrchestrationContext => ({
  now: new Date().toISOString(),
  runId: `${input.tenantId}:${Date.now()}` as OrchestrationContext['runId'],
  tenantId: input.tenantId,
  requestedBy: input.requestedBy,
});

const extractWindows = (commands: readonly CommandDefinition[]): readonly CommandWindow[] =>
  commands.map((command) => command.window);

const buildBlocked = (input: OrchestrationCommandInput, scoreCount: number) => {
  const blockedReasons: string[] = [];
  if (input.commands.length > 60) {
    blockedReasons.push('large-command-batch');
  }
  if (scoreCount === 0) {
    blockedReasons.push('all-commands-removed-after-constraint-check');
  }
  return blockedReasons;
};

export class CommandPlanner {
  constructor(private readonly tenantId: string, private readonly requester: string) {}

  createDraft(input: OrchestrationCommandInput): Result<PlanDraft, Error> {
    try {
      const context: OrchestrationContext = toContext(input);
      const ranked = rankCommands(input.commands as readonly CommandDefinition[], context.now);
      const candidates: CandidateCommand[] = ranked.map((item) => ({
        command: item.command as RecoveryCommand,
        score: item.score,
        blockedReasonCount: evaluateConstraints(item.command.constraints, {
          activePlanSize: input.commands.length,
          currentLoad: input.windowMinutes,
          tenantId: input.tenantId,
          criticalServices: ['auth', 'gateway', 'payments'],
        }).length,
      }));

      const accepted = ranked.filter((entry) => {
        const blocked = isPlanBlockable(
          evaluateConstraints(entry.command.constraints, {
            activePlanSize: input.commands.length,
            currentLoad: input.windowMinutes,
            tenantId: input.tenantId,
            criticalServices: ['auth'],
          }),
        );
        return input.dryRun ? true : !blocked;
      });

      const commands = accepted.map((item) => item.command);
      const planSteps = assignStepOrder(accepted);
      const windows = extractWindows(commands);
      const buckets = buildTimeline(windows, { bucketMinutes: 5, minDemand: 1 });
      const overlapSignals: string[] = [];

      const blockedReasons = summarizeConstraintMessages(
        commands.flatMap((command) =>
          evaluateConstraints(command.constraints, {
            activePlanSize: input.commands.length,
            currentLoad: input.windowMinutes,
            tenantId: input.tenantId,
            criticalServices: ['api-gateway', 'data-layer'],
          }),
        ),
      );

      const totalRisk = commands.reduce((sum, command) => sum + command.riskWeight, 0);
      const timelineDemand = aggregateDemand(buckets);
      const blocked = buildBlocked(input, commands.length);
      const chainPenalties = commands.reduce(
        (acc, command) => acc + command.dependencies.length,
        0,
      );

      let overlapping = 0;
      for (let index = 0; index < windows.length - 1; index += 1) {
        for (let next = index + 1; next < windows.length; next += 1) {
          const overlap = overlapFraction(windows[index], windows[next]);
          if (overlap > 0.75) {
            overlapSignals.push(`overlap:${windows[index].id}->${windows[next].id}:${overlap.toFixed(2)}`);
          }
        }
      }

      const plan: CommandPlan = {
        id: `${input.tenantId}:plan:${context.runId}` as CommandPlan['id'],
        tenantId: input.tenantId,
        createdAt: context.now,
        expiresAt: new Date(Date.now() + input.windowMinutes * 60_000).toISOString(),
        requestedBy: context.requestedBy,
        steps: planSteps,
        totalRisk,
        coverage: timelineDemand + overlapping + chainPenalties,
        blockedReasons: [...new Set([...blocked, ...blockedReasons, ...overlapSignals])],
      };

      return ok({
        plan,
        candidates,
      });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('failed to build plan'));
    }
  }

  simulate(input: SimulationInput): Result<SimulationRun, Error> {
    const createdAt = new Date().toISOString();
    const impacts: readonly SimulatedImpact[] = input.commands.map((command) => ({
      commandId: command.id,
      commandTitle: command.title,
      expectedDowntimeMinutes: command.expectedRunMinutes * 1.2,
      confidence: Math.max(0.1, Math.min(1, 1 - command.riskWeight / 2)),
      recoveryCoverage: Math.max(0.1, 1 - command.riskWeight * 0.05),
      blockers: command.constraints.map((constraint) => constraint.reason),
    }));

    const residualRisk = Math.max(0, 100 - impacts.reduce((sum, impact) => sum + impact.recoveryCoverage * 80, 0));
    const result: SimulationResult = {
      commandPlanId: `${input.tenantId}:sim:${Date.now()}` as SimulationResult['commandPlanId'],
      tenantId: input.tenantId,
      createdAt,
      impacts,
      residualRisk,
      estimatedFinishAt: new Date(Date.now() + input.windowMinutes * 60_000).toISOString(),
    };

    return ok({
      result,
      signals: [],
      createdAt,
    });
  }
}
