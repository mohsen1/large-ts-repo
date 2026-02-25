import type { NoInfer } from '@shared/type-level';
import {
  asMillis,
  asPercent,
  asIncidentId,
  asScenarioConstraintId,
  asScenarioId,
  asScenarioProfileId,
  asScenarioSignalId,
  type CommandId,
  type ScenarioBlueprint,
  type ScenarioConstraint,
  type ScenarioProfile,
  type ScenarioSignal,
  type ScenarioCommand,
  type PlanCandidate,
  type ScenarioPolicyInput,
} from '@domain/recovery-scenario-lens';

import type { OrchestrationInput, OrchestratorEnvelope, OrchestrationRunId } from './types';
import { RecoverySynthesisPlaybookError } from './errors';

export interface PlaybookCommandTemplate {
  readonly token: string;
  readonly commandName: string;
  readonly targetService: string;
  readonly prerequisites: readonly string[];
  readonly resourceSpendUnits: number;
  readonly blastRadius: 0 | 1 | 2 | 3 | 4 | 5;
  readonly estimateMs: number;
}

export interface PlaybookPolicyHint {
  readonly incidentSeverity: ScenarioPolicyInput['incidentSeverity'];
  readonly tenant: string;
  readonly region: string;
  readonly services: readonly string[];
}

export type PlaybookEventName = `event:${string}`;
export type PlaybookRoute = `route:${string}`;

export interface PlaybookSlot<TCommand extends ScenarioCommand = ScenarioCommand> {
  readonly slotIndex: number;
  readonly command: TCommand;
  readonly planAffinity: number;
}

export interface PlaybookPlan<TCommands extends readonly ScenarioCommand[]> {
  readonly planId: `playbook.${string}`;
  readonly commands: TCommands;
  readonly commandsJson: string;
}

export interface PlaybookExecutionResult {
  readonly playbookId: string;
  readonly runId: OrchestrationRunId;
  readonly warnings: readonly string[];
  readonly envelope: OrchestratorEnvelope;
}

const toCommand = (template: PlaybookCommandTemplate, index: number): ScenarioCommand => ({
  commandId: `cmd.${template.token}.${index}` as CommandId,
  commandName: template.commandName,
  targetService: template.targetService,
  estimatedDurationMs: asMillis(template.estimateMs),
  resourceSpendUnits: template.resourceSpendUnits,
  prerequisites: template.prerequisites as readonly CommandId[],
  blastRadius: template.blastRadius,
});

const createRunToken = (value: string | number): string => `run.${value}`;

export { createRunToken };

export const templateToBlueprint = (
  playbookId: string,
  templates: readonly PlaybookCommandTemplate[],
): ScenarioBlueprint => {
  const commands = templates.map((template, index) => toCommand(template, index));
  const links = commands.slice(1).map((command, index) => ({
    from: commands[index].commandId,
    to: command.commandId,
    reason: 'playbook-sequence',
    coupling: 0.65,
  }));

  return {
    scenarioId: asScenarioId(`scenario.${playbookId}`),
    incidentId: asIncidentId(`incident.${playbookId}`),
    name: `Playbook ${playbookId}`,
    windowMinutes: Math.max(1, commands.length * 7),
    baselineConfidence: asPercent(0.93),
    signals: [],
    commands,
    links,
    policies: [playbookId],
  };
};

export const seedSignals = (hints: readonly PlaybookPolicyHint[]): readonly ScenarioSignal[] =>
  hints.map((hint, index) => ({
    signalId: asScenarioSignalId(`signal.${hint.tenant}.${index}`),
    name: `Policy hint ${index}`,
    severity: 'info',
    score: asPercent(0.71),
    observedAt: new Date().toISOString(),
    context: {
      tenant: hint.tenant,
      region: hint.region,
      services: hint.services.join(','),
    },
    source: 'manual',
  }));

export const buildPlaybookInput = (
  playbookId: string,
  commands: readonly PlaybookCommandTemplate[],
  hints: readonly PlaybookPolicyHint[],
): OrchestrationInput => {
  const blueprint = templateToBlueprint(playbookId, commands);
  const firstHint = hints[0] ?? {
    incidentSeverity: 'critical',
    tenant: 'default',
    region: 'global',
    services: ['synthesis'],
  };

  return {
    blueprint,
    profile: buildScenarioProfile(playbookId, firstHint),
    policyInputs: hints.map((hint) => ({
      incidentSeverity: hint.incidentSeverity,
      tenant: hint.tenant,
      services: hint.services,
      region: hint.region,
      availableOperators: Math.max(1, hint.services.length),
    })),
    constraints: buildDefaultConstraints(blueprint.commands, hints.map((hint) => hint.tenant)),
    signals: seedSignals(hints),
    initiatedBy: `playbook.${playbookId}`,
  };
};

export const buildDefaultConstraints = (
  commands: readonly ScenarioCommand[],
  tenants: readonly string[],
): readonly ScenarioConstraint[] => {
  const parallelism: ScenarioConstraint = {
    constraintId: asScenarioConstraintId(`playbook.parallelism.${commands.length}`),
    type: 'max_parallelism',
    description: 'Playbook parallelism cap',
    severity: 'warning',
    commandIds: commands.map((command) => command.commandId),
    limit: Math.max(1, Math.min(5, commands.length)),
  };

  const tenantConstraints = tenants.map((tenant, index) => ({
    constraintId: asScenarioConstraintId(`playbook.tenant.${tenant}.${index}`),
    type: 'region_gate' as const,
    description: `tenant zone gate: ${tenant}`,
    severity: 'warning' as const,
    commandIds: commands.map((command) => command.commandId),
    limit: 1,
  }));

  return [parallelism, ...tenantConstraints];
};

const buildScenarioProfile = (playbookId: string, hint: PlaybookPolicyHint): ScenarioProfile => ({
  profileId: asScenarioProfileId(playbookId),
  name: `Playbook profile ${playbookId}`,
  maxParallelism: Math.max(1, Math.min(8, hint.tenant.length)),
  maxBlastRadius: 5,
  maxRuntimeMs: asMillis(60_000),
  allowManualOverride: true,
  policyIds: [playbookId],
});

export class PlaybookPlanBuilder<TTemplates extends readonly PlaybookCommandTemplate[]> {
  readonly #templates: NoInfer<TTemplates>;
  readonly #playbookId: string;

  constructor(playbookId: string, templates: NoInfer<TTemplates>) {
    this.#templates = templates;
    this.#playbookId = playbookId;
  }

  buildPlan(): PlaybookPlan<{ readonly [K in keyof TTemplates]: ScenarioCommand }> {
    const commands = this.#templates.map((template, index) => toCommand(template, index));
    return {
      planId: `playbook.${this.#playbookId}` as const,
      commands: commands as unknown as { readonly [K in keyof TTemplates]: ScenarioCommand },
      commandsJson: JSON.stringify(commands),
    };
  }

  buildInput(hints: readonly PlaybookPolicyHint[]): OrchestrationInput {
    return buildPlaybookInput(this.#playbookId, this.#templates, hints);
  }

  toSlots(): readonly PlaybookSlot<ScenarioCommand>[] {
    const commands = this.#templates.map((template, index) => toCommand(template, index));
    return commands.map((command, slotIndex) => ({
      slotIndex,
      command,
      planAffinity: Math.max(0.05, 1 - slotIndex * 0.07),
    }));
  }
}

type TemplatesToCommands<TTemplates extends readonly PlaybookCommandTemplate[]> = {
  [K in keyof TTemplates]: TTemplates[K] extends PlaybookCommandTemplate ? ScenarioCommand : never;
};

export const toPlaybookSlots = <TCommands extends readonly ScenarioCommand[]>(plan: PlaybookPlan<TCommands>): readonly PlaybookSlot[] =>
  JSON.parse(plan.commandsJson).map((command: ScenarioCommand, index: number) => ({
    slotIndex: index,
    command,
    planAffinity: 0.8,
  }));

export const routeByTenant = (tenant: string): PlaybookRoute => `route.${tenant}`.replaceAll('.', ':') as PlaybookRoute;

const builtInTemplate = [
  {
    token: 'bootstrap',
    commandName: 'Bootstrap edge node',
    targetService: 'api-gateway',
    prerequisites: [],
    resourceSpendUnits: 2,
    blastRadius: 1,
    estimateMs: 120_000,
  },
  {
    token: 'drain',
    commandName: 'Drain non-essential traffic',
    targetService: 'traffic-manager',
    prerequisites: ['cmd.bootstrap.0'],
    resourceSpendUnits: 4,
    blastRadius: 2,
    estimateMs: 240_000,
  },
  {
    token: 'heal',
    commandName: 'Run self-heal',
    targetService: 'recovery-core',
    prerequisites: ['cmd.drain.1'],
    resourceSpendUnits: 5,
    blastRadius: 3,
    estimateMs: 300_000,
  },
] as const satisfies readonly PlaybookCommandTemplate[];

export const buildDefaultPlaybookInput = (playbookId: string): OrchestrationInput =>
  buildPlaybookInput(playbookId, builtInTemplate, [
    {
      incidentSeverity: 'critical',
      tenant: 'default',
      region: 'us-east-1',
      services: ['api-gateway', 'traffic-manager', 'recovery-core'],
    },
  ]);

export const validatePlanCandidate = (candidate: PlanCandidate): candidate is PlanCandidate =>
  candidate.windows.every((window) => window.concurrency > 0) && candidate.score >= 0 && candidate.risk >= 0;

export const computeAffinity = (slots: readonly PlaybookSlot[]): number =>
  slots.reduce((acc, slot) => acc + slot.planAffinity, 0) / Math.max(1, slots.length);

export const formatRoute = (route: PlaybookRoute, event: PlaybookEventName): string => `${route}::${event}`;

export const pickPlaybookProfile = (profiles: readonly ScenarioProfile[]): ScenarioProfile | undefined =>
  profiles.find((profile) => profile.allowManualOverride);

export interface PlaybookInputContext {
  readonly playbookId: string;
  readonly commandCount: number;
  readonly timeline: string;
}

export const withPlaybook = <T>(
  playbook: Readonly<PlaybookPlan<readonly ScenarioCommand[]>>,
  callback: (input: PlaybookInputContext) => T,
): T => {
  const context: PlaybookInputContext = {
    playbookId: playbook.planId,
    commandCount: playbook.commands.length,
    timeline: playbook.commandsJson,
  };
  return callback(context);
};

export const enrichInputWithDefaults = (
  input: OrchestrationInput,
  warnings: readonly string[],
): OrchestrationInput & { readonly __warnings: readonly string[] } => ({
  ...input,
  constraints: [...input.constraints],
  policyInputs: [...input.policyInputs],
  __warnings: warnings,
});

export interface PlaybookExecutionContext<T extends object = Record<string, unknown>> {
  readonly profile: ScenarioProfile;
  readonly timeline: readonly string[];
  readonly context: T;
}

export const withExecutionContext = <TContext extends object = Record<string, unknown>>(
  input: PlaybookExecutionContext<TContext>,
  callback: (context: PlaybookExecutionContext<TContext>) => PlaybookExecutionResult,
): PlaybookExecutionResult => {
  const warningCount = Object.keys(input.context).length;
  void warningCount;
  return callback({
    profile: input.profile,
    timeline: input.timeline,
    context: input.context,
  });
};

export class PlaybookError extends RecoverySynthesisPlaybookError {
  constructor(message: string, public readonly playbook: string) {
    super(`playbook:${playbook} ${message}`);
  }
}
