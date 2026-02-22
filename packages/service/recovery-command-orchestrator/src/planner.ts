import type { IncidentRecord, IncidentPlan, IncidentSignal, OrchestrationRun } from '@domain/recovery-incident-orchestration';
import {
  buildCommandTemplatePolicy,
  evaluatePlaybookPolicy,
  normalizePolicyDecision,
  runbookReadinessScore,
  scorePlaybook,
  type CommandTemplateOptions,
  type CommandRunbook,
  type PlaybookSimulation,
  buildCommandDigest,
  buildExecutionGraph,
  commandExecutionOrder,
} from '@domain/incident-command-core';
import { buildRunbook, templateFromIncident } from '@domain/incident-command-core';

export interface DraftPlanContext {
  readonly tenantId: string;
  readonly customOptions: Partial<CommandTemplateOptions>;
}

const defaultOptions: CommandTemplateOptions = {
  includeNotifyOnly: false,
  maxParallelism: 3,
  minimumReadinessScore: 4,
  maxRiskScore: 8,
  includeRollbackWindowMinutes: 30,
};

const sortSignals = (signals: readonly IncidentSignal[]) =>
  [...signals].sort((a, b) => b.observedAt.localeCompare(a.observedAt));

export class CommandRunbookPlanner {
  constructor(private readonly defaults: CommandTemplateOptions = defaultOptions) {}

  async generateDraftPlan(
    incident: IncidentRecord,
    plan: IncidentPlan,
    runs: readonly OrchestrationRun[],
    context: DraftPlanContext,
  ): Promise<CommandRunbook> {
    const policy: CommandTemplateOptions = {
      ...this.defaults,
      ...context.customOptions,
    };
    const template = templateFromIncident({
      tenantId: context.tenantId,
      incidentId: String(incident.id),
      title: incident.title,
      hints: incident.labels,
      safetyWindowMinutes: policy.includeRollbackWindowMinutes,
    });

    const runbook = buildRunbook({ incidentId: String(incident.id), planId: String(plan.id) }, incident, plan, runs);
    const policyRules = buildCommandTemplatePolicy(template, policy);
    const violations = [...evaluatePlaybookPolicy(runbook.playbook, policyRules)];
    const readiness = runbookReadinessScore(template, sortSignals(incident.signals));
    const score = scorePlaybook(runbook.playbook, policyRules);
    const decision = normalizePolicyDecision(score, violations);

    const graph = buildExecutionGraph(
      runbook.playbook.commands.map((command) => ({
        id: command.id,
        dependsOn: command.dependsOn,
      })),
      String(runbook.id),
    );

    const frameOrder = commandExecutionOrder(graph);
    if (decision === 'block') {
      violations.push({
        commandId: runbook.playbook.commands[0]?.id ?? (runbook.id as any),
        reason: `blocked by policy score=${score}`,
      });
    }

    const simulation: PlaybookSimulation = {
      runbook,
      frameOrder,
      parallelism: Math.min(policy.maxParallelism, Math.max(1, Math.floor((readiness + 1) / 2))),
      expectedFinishAt: new Date(Date.now() + frameOrder.length * 60000).toISOString(),
      violations,
    };

    const digest = buildCommandDigest(runbook, violations);
    return {
      ...runbook,
      state: decision === 'block' ? 'blocked' : 'draft',
      riskScore: digest.estimatedMinutes + score + runbook.id.length + runs.length,
      stateTransitions: [
        ...runbook.stateTransitions,
        {
          at: new Date().toISOString(),
          state: decision === 'block' ? 'blocked' : 'draft',
          operator: context.tenantId,
          note: `policy=${decision},readiness=${readiness.toFixed(1)},score=${score}`,
        },
      ],
      playbook: {
        ...runbook.playbook,
        commands: runbook.playbook.commands,
      },
    };
  }
}
