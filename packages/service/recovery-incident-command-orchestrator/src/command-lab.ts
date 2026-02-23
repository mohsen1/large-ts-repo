import { ok, fail } from '@shared/result';
import type { Result } from '@shared/result';
import {
  type CommandTemplate,
  type CommandTemplateOptions,
  type CommandRunbook,
  type CommandPlaybook,
  type CommandState,
  buildCommandId,
} from '@domain/incident-command-core';
import {
  openLabContext,
  toOrchestrationBundle,
  catalogFromRunbooks,
  commandIdsFromRunbook,
  toRunbookAudit,
  buildPlanLabProfile,
  buildPlaybookId,
} from '@domain/incident-command-core';
import {
  type RecoveryCommand,
  type CommandConstraint,
  type CommandWindow,
} from '@domain/incident-command-models';
import type { Brand } from '@shared/type-level';
import {
  type OrchestrationCommandInput,
  type ExecutionInput,
  type OrchestrationRunId,
} from './types';
import {
  buildPlanId,
  type IncidentPlan,
  type WorkItemId,
  type RouteId,
  type IncidentId,
} from '@domain/recovery-incident-orchestration';
import { RecoveryIncidentCommandOrchestrator } from './runner';
import { InMemoryIncidentCommandStore } from '@data/incident-command-store';

export interface CommandLabDraft {
  readonly runId: string;
  readonly planId: string;
  readonly candidates: readonly string[];
  readonly order: readonly string[];
  readonly snapshot: string;
}

export interface CommandLabRun {
  readonly runId: string;
  readonly tenantId: string;
  readonly commandIds: readonly string[];
  readonly catalog: readonly string[];
  readonly audits: readonly string[];
}

const buildIncidentId = (tenantId: string, templateId: string): IncidentId =>
  `${tenantId}:incident:${templateId}` as IncidentId;

const commandWindow = (seed: string, index: number): CommandWindow => ({
  id: `${seed}:window:${index}` as string as Brand<string, 'WindowId'>,
  startsAt: new Date(Date.now() + index * 60_000).toISOString(),
  endsAt: new Date(Date.now() + (index + 3) * 60_000).toISOString(),
  preferredClass: 'compute',
  maxConcurrent: 2,
});

const templateFromSeed = (tenantId: string, templateSeed: string): CommandTemplate => {
  const normalizedSeed = templateSeed.replace(/[^a-z0-9-]/gi, '-').toLowerCase() || 'default';
  const templateId = `${tenantId}:${normalizedSeed}` as CommandTemplate['id'];

  return {
    id: templateId,
    name: `Template ${templateSeed}`,
    description: `Synthetic recovery template for ${tenantId}`,
    commandHints: [normalizedSeed, 'rollback', 'notify'],
    priorityModifier: 1,
    safetyWindowMinutes: 25,
  };
};

const commandConstraint = (seed: string, index: number): CommandConstraint => ({
  id: `${seed}:constraint:${index}` as Brand<string, 'ConstraintId'>,
  commandId: buildCommandId(seed, index, 'seed') as Brand<string, 'CommandId'>,
  reason: `constraint-${index}`,
  hard: index % 2 === 0,
  tags: ['lab', seed],
});

const buildRecoveryCommands = (template: CommandTemplate): readonly RecoveryCommand[] =>
  [...Array.from({ length: 6 })].map((_, index) => ({
    id: buildCommandId(String(template.id), index, template.name),
    title: `${template.name} command ${index + 1}`,
    description: `Recovery command ${index + 1}`,
    ownerTeam: 'incident-command-lab',
    priority: 'high',
    window: commandWindow(String(template.id), index),
    affectedResources: ['compute'],
    dependencies: index === 0 ? [] : [buildCommandId(String(template.id), index - 1, template.name)],
    prerequisites: ['readiness'],
    constraints: [commandConstraint(String(template.id), index)],
    expectedRunMinutes: 8 + index,
    riskWeight: 0.3 + index * 0.05,
    runbook: ['stabilize'],
    runMode: 'full',
    retryWindowMinutes: 10,
  }));

const buildPlan = (tenantId: string, template: CommandTemplate): IncidentPlan => {
  const planIncidentId = buildIncidentId(tenantId, String(template.id));
  const id = buildPlanId(planIncidentId);
  const routeNodeId = `${tenantId}:node:${template.id}` as WorkItemId;
  const routeId = `${tenantId}:route:${template.id}` as RouteId;

  return {
    id,
    incidentId: planIncidentId,
    title: `Command-lab plan ${template.name}`,
    windows: [],
    route: {
      id: routeId,
      incidentId: planIncidentId,
      nodes: [
        {
          id: routeNodeId,
          dependsOn: [],
          play: {
            id: routeNodeId,
            label: `play-${template.name}`,
            command: template.name,
            parameters: {
              template: String(template.id),
            },
            timeoutMinutes: 20,
            retryPolicy: {
              maxAttempts: 3,
              intervalMinutes: 10,
              backoffMultiplier: 1.2,
            },
          },
        },
      ],
      createdAt: new Date().toISOString(),
      owner: tenantId,
    },
    metadata: {
      source: 'command-lab',
      template: template.name,
    },
    riskScore: 6,
    approved: false,
  };
};

const buildPlaybook = (template: CommandTemplate, plan: IncidentPlan): CommandPlaybook => ({
  id: buildPlaybookId(plan.incidentId, plan.id),
  incidentId: plan.incidentId,
  templateName: template.name,
  templateVersion: 'v1',
  commands: buildRecoveryCommands(template).map((command, index) => ({
    id: command.id,
    label: `${template.name} action ${index + 1}`,
    owner: 'incident-command-lab',
    actionKind: index % 3 === 0 ? 'notify' : 'play',
    severity: 'medium',
    dependsOn: command.dependencies,
    expectedDurationMinutes: command.expectedRunMinutes,
    metadata: {
      template: String(template.id),
      step: String(index),
    },
    instructions: [`step=${index + 1}`, `command=${command.title}`],
    parameters: {
      commandId: String(command.id),
      planId: String(plan.id),
    },
  })),
  constraints: {
    requiresHumanApproval: false,
    maxRetryAttempts: 3,
    backoffMinutes: 5,
    abortOnFailure: false,
    allowedRegions: ['us-east-1'],
  },
  generatedAt: new Date().toISOString(),
});

const buildRunbook = (tenantId: string, template: CommandTemplate): CommandRunbook => {
  const plan = buildPlan(tenantId, template);
  const playbook = buildPlaybook(template, plan);
  const state: CommandState = 'draft';

  return {
    id: buildPlaybookId(plan.incidentId, plan.id),
    incidentId: plan.incidentId,
    plan,
    template,
    playbook,
    state,
    stateTransitions: [
      {
        at: new Date().toISOString(),
        state,
        operator: tenantId,
        note: `template=${template.id}`,
      },
    ],
    riskScore: plan.riskScore + template.priorityModifier,
  };
};

export class CommandLabOrchestrator {
  private readonly core: RecoveryIncidentCommandOrchestrator;
  private readonly store = new InMemoryIncidentCommandStore();

  constructor(private readonly tenantId: string, private readonly requestedBy: string) {
    this.core = RecoveryIncidentCommandOrchestrator.create(this.tenantId, this.requestedBy);
  }

  static create(tenantId: string, requestedBy: string): CommandLabOrchestrator {
    return new CommandLabOrchestrator(tenantId, requestedBy);
  }

  async draft(templateId: string, options: CommandTemplateOptions): Promise<Result<CommandLabDraft, Error>> {
    const template = templateFromSeed(this.tenantId, templateId);
    const commands = buildRecoveryCommands(template);

    const draftInput: OrchestrationCommandInput = {
      tenantId: this.tenantId,
      requestedBy: this.requestedBy,
      commands,
      windowMinutes: options.includeRollbackWindowMinutes,
      dryRun: true,
    };

    const draft = await this.core.draft(draftInput);
    if (!draft.ok) {
      return fail(draft.error);
    }

    const runbook = buildRunbook(this.tenantId, template);
    const context = openLabContext(this.tenantId, String(draft.value.draft.plan.id), template);
    const bundle = toOrchestrationBundle(runbook, options);
    const profile = buildPlanLabProfile(this.tenantId, [runbook], [template], options.includeRollbackWindowMinutes);

    return ok({
      runId: String(context.runId),
      planId: String(runbook.id),
      candidates: bundle.candidates.map((candidate) => String(candidate.id)),
      order: bundle.order.map(String),
      snapshot: `${bundle.snapshot}|profile=${profile.commandCount}|window=${profile.windowMinutes}`,
    });
  }

  async execute(input: ExecutionInput): Promise<Result<CommandLabRun, Error>> {
    const execution = await this.core.execute({
      ...input,
      planId: input.planId as OrchestrationRunId,
      commandIds: [...input.commandIds],
    });
    if (!execution.ok) {
      return fail(execution.error);
    }

    const template = templateFromSeed(this.tenantId, `${input.commandIds.length}-execution`);
    const runbook = buildRunbook(this.tenantId, template);
    const catalog = catalogFromRunbooks([runbook], [template], runbook.id as any);
    const catalogEntries = catalog.entries.map((entry) => `${String(entry.templateId)}:${entry.commandCount}`);
    const auditLog = toRunbookAudit(runbook, this.requestedBy);

    return ok({
      runId: String(execution.value.runId),
      tenantId: this.tenantId,
      commandIds: commandIdsFromRunbook(runbook),
      catalog: catalogEntries,
      audits: auditLog,
    });
  }

  async surfaceState(): Promise<Result<readonly string[], Error>> {
    const plans = await this.store.listPlans({ tenantId: this.tenantId, limit: 20 });
    if (!plans.ok) {
      return fail(plans.error);
    }

    return ok(plans.value.map((plan) => `${plan.id}:${plan.tenantId}`));
  }
}
