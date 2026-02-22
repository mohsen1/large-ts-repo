import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { CommandRunbookPlanner } from './planner';
import { withBrand } from '@shared/core';
import type {
  CommandOrchestratorConfig,
  CommandOrchestratorContext,
  CommandOrchestratorReport,
  CommandOrchestratorRun,
  PlanExecutionResult,
} from './types';
import type { OrchestrationRun } from '@domain/recovery-incident-orchestration';
import { buildExecutionGraph, commandExecutionOrder, toDeepReadonlySimulation } from '@domain/incident-command-core';

export class RecoveryCommandOrchestrator {
  private readonly planner: CommandRunbookPlanner;

  constructor(
    private readonly repository: RecoveryIncidentRepository,
    config: Partial<CommandOrchestratorConfig> = {},
  ) {
    this.planner = new CommandRunbookPlanner({
      includeNotifyOnly: true,
      maxParallelism: 2,
      minimumReadinessScore: 4,
      maxRiskScore: 5,
      includeRollbackWindowMinutes: 20,
      ...config.policy,
    });
  }

  async prepareRun(context: CommandOrchestratorContext): Promise<CommandOrchestratorRun> {
    const incidentLookup = await this.repository.findIncidents({ limit: 500 });
    const incident = incidentLookup.data.find((entry) => String(entry.id) === String(context.incidentId));
    if (!incident) {
      throw new Error(`incident not found: ${context.incidentId}`);
    }

    const planRecords = await this.repository.findPlans(context.incidentId);
    const selected = planRecords.find((record) => record.plan.id === context.planId);
    if (!selected) {
      throw new Error(`plan not found: ${context.planId}`);
    }

    const runs = await this.repository.getRuns(context.incidentId);
    const runbook = await this.planner.generateDraftPlan(incident, selected.plan, runs, {
      tenantId: incident.scope.tenantId,
      customOptions: { maxParallelism: 3, includeRollbackWindowMinutes: 30 },
    });

    const graph = buildExecutionGraph(
      runbook.playbook.commands.map((command) => ({
        id: command.id,
        dependsOn: command.dependsOn,
      })),
      String(runbook.id),
    );

    const frameOrder = commandExecutionOrder(graph);
    const payload = {
      source: 'command-orchestrator',
      context: {
        operator: context.operator,
        incidentId: context.incidentId,
        planId: context.planId,
      },
    };

    const frames = toDeepReadonlySimulation(
      frameOrder.map((commandId) => ({
        commandId,
        state: runbook.state,
        command: runbook.playbook.commands.find((entry) => entry.id === commandId) ?? runbook.playbook.commands[0],
        run: runs.find((run) => String(run.nodeId) === String(commandId)),
      })),
    );

    return {
      payload,
      runbook,
      simulation: {
        runbook,
        frameOrder,
        parallelism: runbook.stateTransitions.length === 0 ? 1 : runbook.stateTransitions.length,
        expectedFinishAt: new Date(Date.now() + frameOrder.length * 45000).toISOString(),
        violations: [],
      },
      frames,
    };
  }

  async executeRun(context: CommandOrchestratorContext): Promise<CommandOrchestratorReport> {
    const prepared = await this.prepareRun(context);
    const orderedCommandIds = prepared.simulation.frameOrder;
    const runs: OrchestrationRun[] = [];

    for (const commandId of orderedCommandIds) {
      const run: OrchestrationRun = {
        id: `${prepared.runbook.id}:${commandId}` as OrchestrationRun['id'],
        planId: prepared.runbook.plan.id,
        nodeId: withBrand(String(commandId), 'WorkItemId') as OrchestrationRun['nodeId'],
        state: 'running',
        startedAt: new Date().toISOString(),
        output: {
          operator: context.operator,
          commandId,
        },
      };
      runs.push(run);
    }

    const report: PlanExecutionResult = {
      plan: prepared.runbook.plan,
      commandRuns: runs,
    };
    void report;

    return {
      runbookId: prepared.runbook.id,
      frameCount: orderedCommandIds.length,
      plannedMinutes: Number(prepared.runbook.riskScore.toFixed(0)),
      executedRuns: runs.length,
      logs: orderedCommandIds.map((commandId, index) => ({
        id: `${prepared.runbook.id}:log:${index}` as never,
        runbookId: prepared.runbook.id,
        state: prepared.runbook.state,
        at: new Date(Date.now() + index * 1000).toISOString(),
        message: `executed command ${commandId}`,
        metadata: {
          commandId,
        },
      })),
    };
  }
}
