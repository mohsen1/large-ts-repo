import type { Brand } from '@shared/core';
import type { IncidentPlanId } from '@domain/recovery-incident-orchestration';
import type { IncidentOperationPlan } from './incident-routing';

export type PlaybookStatus = 'draft' | 'compiled' | 'activated' | 'retired';
export type PlaybookTemplateId = Brand<string, 'PlaybookTemplateId'>;
export type PlaybookVersion = Brand<number, 'PlaybookVersion'>;

export interface IncidentPlaybookTemplate {
  readonly templateId: PlaybookTemplateId;
  readonly title: string;
  readonly tags: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlaybookStep {
  readonly order: number;
  readonly command: string;
  readonly action: string;
  readonly actor: 'operator' | 'automation' | 'policy';
  readonly prerequisites: readonly string[];
  readonly timeoutMinutes: number;
}

export interface CompiledPlaybook {
  readonly playbookId: PlaybookTemplateId;
  readonly planId: IncidentPlanId;
  readonly status: PlaybookStatus;
  readonly version: PlaybookVersion;
  readonly steps: readonly PlaybookStep[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}

export interface PlaybookArtifact {
  readonly artifactId: Brand<string, 'PlaybookArtifactId'>;
  readonly planId: IncidentPlanId;
  readonly source: string;
  readonly checksum: string;
  readonly generatedAt: string;
  readonly sizeBytes: number;
}

export interface PlaybookBuildInput {
  readonly template: IncidentPlaybookTemplate;
  readonly routePlan: IncidentOperationPlan;
  readonly commands: readonly string[];
}

const toVersion = (value: number): PlaybookVersion => {
  const normalized = Number.isFinite(value) ? value : 1;
  return Math.max(1, Math.round(normalized)) as PlaybookVersion;
};

const checksum = (value: string): string => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return `sha1:${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

const buildStep = (index: number, command: string): PlaybookStep => {
  const action = command.includes('plan')
    ? 'generate'
    : command.includes('approve')
      ? 'approve'
      : command.includes('run')
        ? 'execute'
        : 'verify';
  return {
    order: index,
    command,
    action,
    actor: index % 3 === 0 ? 'operator' : index % 3 === 1 ? 'automation' : 'policy',
    prerequisites: index === 0 ? ['incident-identified'] : [`step:${index - 1}`],
    timeoutMinutes: 5 + index * 3,
  };
};

const buildSteps = (commands: readonly string[]): readonly PlaybookStep[] =>
  commands.map((command, index) => buildStep(index, command));

export const compilePlaybook = (input: PlaybookBuildInput): CompiledPlaybook => {
  const baseStep: string[] = [
    `open:${input.routePlan.incidentId}`,
    ...input.commands.map((command) => `${input.routePlan.selectedRoute}:${command}`),
    `close:${input.routePlan.planId}`,
  ];
  const derived = buildSteps(baseStep);
  const versionSeed = input.routePlan.readinessScore + derived.length;
  const playbookText = [
    input.template.templateId,
    String(input.routePlan.planId),
    input.template.title,
    derived.map((step) => `${step.order}:${step.command}`).join('|'),
  ].join('||');

  return {
    playbookId: input.template.templateId,
    planId: input.routePlan.planId,
    status: input.routePlan.priority === 'urgent' ? 'activated' : 'compiled',
    version: toVersion(versionSeed),
    steps: derived,
    metadata: {
      tenant: input.routePlan.tenant,
      selectedRoute: input.routePlan.selectedRoute,
      signalCount: input.commands.length,
      confidence: input.routePlan.readinessScore,
      checksum: checksum(playbookText),
      draft: false,
    },
  };
};

export const buildTemplate = (id: string, title: string): IncidentPlaybookTemplate => {
  const now = new Date().toISOString();
  return {
    templateId: `${id}:template` as PlaybookTemplateId,
    title,
    tags: ['recovery', 'incident', 'orchestration'],
    createdAt: now,
    updatedAt: now,
  };
};

export const compileArtifact = (input: CompiledPlaybook): PlaybookArtifact => {
  const rendered = JSON.stringify(input);
  const encoded = new TextEncoder().encode(rendered);
  return {
    artifactId: `${input.playbookId}:${input.version}:artifact` as Brand<string, 'PlaybookArtifactId'>,
    planId: input.planId,
    source: input.steps.map((entry) => entry.command).join(';'),
    checksum: checksum(rendered),
    generatedAt: new Date().toISOString(),
    sizeBytes: encoded.length,
  };
};

export const estimateRunTime = (steps: readonly PlaybookStep[]): number => {
  return steps.reduce((total, step) => total + step.timeoutMinutes, 0);
};

export const normalizeSteps = (steps: readonly PlaybookStep[]): readonly PlaybookStep[] =>
  steps
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step, index) => ({ ...step, order: index }));
