import { z } from 'zod';
import { withBrand, type Brand } from '@shared/core';
import type { IncidentId, IncidentRecord, SeverityBand, IncidentScope } from './types';

export const playbookChannelSchema = z.object({
  name: z.string().min(1),
  enabled: z.boolean(),
  timeoutMinutes: z.number().int().min(1),
  parallelism: z.number().int().min(1),
});

export const playbookTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(3),
  category: z.string().min(1),
  tenantId: z.string(),
  ownerTeam: z.string().min(1),
  commands: z.array(z.object({
    command: z.string(),
    owner: z.string(),
    minimumReadiness: z.number().min(0).max(1),
    maxRetry: z.number().int().min(1),
    windowMinutes: z.number().min(1),
  })),
  channels: z.array(playbookChannelSchema),
  tags: z.array(z.string()),
  createdAt: z.string().datetime(),
});

export type PlaybookId = Brand<string, 'PlaybookId'>;
export type CommandId = Brand<string, 'PlaybookCommandId'>;

export interface PlaybookCommand {
  readonly id: CommandId;
  readonly command: string;
  readonly owner: string;
  readonly minimumReadiness: number;
  readonly maxRetry: number;
  readonly windowMinutes: number;
}

export interface PlaybookChannel {
  readonly name: string;
  readonly enabled: boolean;
  readonly timeoutMinutes: number;
  readonly parallelism: number;
}

export interface PlaybookTemplate {
  readonly id: PlaybookId;
  readonly title: string;
  readonly category: string;
  readonly tenantId: string;
  readonly ownerTeam: string;
  readonly commands: readonly PlaybookCommand[];
  readonly channels: readonly PlaybookChannel[];
  readonly tags: readonly string[];
  readonly createdAt: string;
}

export interface PlaybookCandidate {
  readonly template: PlaybookTemplate;
  readonly priority: number;
  readonly reason: string;
}

export interface PortfolioSlot {
  readonly scope: IncidentScope;
  readonly incidentId: IncidentId;
  readonly candidates: readonly PlaybookCandidate[];
  readonly selectedTemplateId?: PlaybookId;
  readonly createdAt: string;
}

export interface PlaybookAssignment {
  readonly id: PlaybookId;
  readonly incidentId: IncidentId;
  readonly templateId: PlaybookId;
  readonly operator: string;
  readonly assignedAt: string;
}

export interface PlaybookCommandBudget {
  readonly owner: string;
  readonly requiredCapacity: number;
  readonly commandCount: number;
}

export interface PlaybookReadiness {
  readonly severity: SeverityBand;
  readonly requiredApprovals: number;
  readonly hasCriticalPaths: boolean;
  readonly budget: readonly PlaybookCommandBudget[];
  readonly confidence: number;
}

const buildPlaybookId = (seed: string): PlaybookId =>
  withBrand(`${seed}:${Date.now()}` as string, 'PlaybookId');

const normalizeCommand = (command: string): string => command.trim().toLowerCase();

export const buildPlaybookTemplate = (value: {
  title: string;
  category: string;
  tenantId: string;
  ownerTeam: string;
  commands: readonly Omit<PlaybookCommand, 'id'>[];
  channels: readonly Omit<PlaybookChannel, never>[];
  tags: readonly string[];
}): PlaybookTemplate => {
  const commands = value.commands.map((entry, index) => ({
    id: buildCommandId(`${value.tenantId}:${value.category}:${index}`),
    command: normalizeCommand(entry.command),
    owner: entry.owner,
    minimumReadiness: Math.max(0, Math.min(1, entry.minimumReadiness)),
    maxRetry: Math.max(1, Math.min(8, entry.maxRetry)),
    windowMinutes: Math.max(1, entry.windowMinutes),
  }));
  const channels = value.channels.map((entry) => ({
    name: entry.name.toLowerCase(),
    enabled: entry.enabled,
    timeoutMinutes: Math.max(1, entry.timeoutMinutes),
    parallelism: Math.max(1, Math.min(16, entry.parallelism)),
  }));
  return {
    id: buildPlaybookId(`${value.tenantId}:${value.category}:${value.title}`),
    title: value.title,
    category: value.category,
    tenantId: value.tenantId,
    ownerTeam: value.ownerTeam,
    commands,
    channels,
    tags: Array.from(new Set(value.tags.map((tag) => tag.trim().toLowerCase()))),
    createdAt: new Date().toISOString(),
  };
};

export const buildCommandId = (seed: string): CommandId =>
  withBrand(seed, 'PlaybookCommandId');

export const rankPlaybookTemplates = (templates: readonly PlaybookTemplate[]): readonly PlaybookTemplate[] =>
  [...templates]
    .map((template) => ({
      template,
      score: template.commands.length + template.channels.length + template.tags.length,
    }))
    .sort((left, right) => right.score - left.score)
    .map((entry) => entry.template);

export const buildPlaybookCandidates = (
  templates: readonly PlaybookTemplate[],
  incident: IncidentRecord,
): readonly PlaybookCandidate[] =>
  rankPlaybookTemplates(templates).map((template) => {
    const score = computeTemplateFitness(template, incident);
    return {
      template,
      priority: score,
      reason: score > 0.75
        ? 'high context fit'
        : score > 0.45
          ? 'balanced fit'
          : 'manual review',
    };
  });

export const computeTemplateFitness = (template: PlaybookTemplate, incident: IncidentRecord): number => {
  let score = 0;
  const incidentTagPenalty = incident.labels.reduce((acc, label) => {
    return acc + (template.tags.includes(label.toLowerCase()) ? 0.25 : 0);
  }, 0);
  const regionMatch = template.title.toLowerCase().includes(incident.scope.region.toLowerCase()) ? 0.2 : 0;
  const serviceMatch = template.tags.includes(incident.scope.serviceName.toLowerCase()) ? 0.2 : 0;
  const readiness = severityFactor(incident.severity);
  const commandScore = template.commands.length === 0 ? 0 : Math.min(1, template.commands.length / 6);
  score = incidentTagPenalty + regionMatch + serviceMatch + readiness + commandScore;
  return Number(Math.max(0, Math.min(1, score)).toFixed(4));
};

export const buildReadiness = (
  template: PlaybookTemplate,
  incident: IncidentRecord,
): PlaybookReadiness => {
  const budgets = template.commands.reduce<Map<string, PlaybookCommandBudget>>((acc, command) => {
    const previous = acc.get(command.owner);
    if (previous) {
      acc.set(command.owner, {
        owner: command.owner,
        requiredCapacity: previous.requiredCapacity + command.windowMinutes,
        commandCount: previous.commandCount + 1,
      });
    } else {
      acc.set(command.owner, {
        owner: command.owner,
        requiredCapacity: command.windowMinutes,
        commandCount: 1,
      });
    }
    return acc;
  }, new Map<string, PlaybookCommandBudget>());
  const hasCriticalPaths = template.channels.some((channel) => channel.parallelism > 2);
  const confidence = computeConfidence(template, incident);

  return {
    severity: incident.severity,
    requiredApprovals: template.commands.length > 6 ? 2 : 1,
    hasCriticalPaths,
    budget: [...budgets.values()],
    confidence,
  };
};

const computeConfidence = (template: PlaybookTemplate, incident: IncidentRecord): number => {
  const ownerCoverage = new Set(template.commands.map((command) => command.owner)).size;
  const commandCoverage = template.commands.length;
  const incidentComplexity = incident.labels.length + incident.signals.length;
  const base = 0.2 + Math.min(0.8, ownerCoverage / Math.max(1, commandCoverage));
  const complexityPenalty = Math.max(0, Math.min(0.3, incidentComplexity / 20));
  const severityBoost = incident.severity === 'extreme' ? 0.2 : 0;
  return Number(Math.max(0, Math.min(1, base - complexityPenalty + severityBoost)).toFixed(4));
};

const severityFactor = (severity: SeverityBand): number => {
  if (severity === 'low') return 0.15;
  if (severity === 'medium') return 0.3;
  if (severity === 'high') return 0.45;
  if (severity === 'critical') return 0.7;
  return 0.95;
};

export const portfolioFromSlots = (
  slots: readonly PortfolioSlot[],
): Readonly<Record<string, readonly PlaybookId[]>> =>
  slots.reduce((acc, slot) => {
    const entries = acc[slot.scope.tenantId] ?? [];
    return {
      ...acc,
      [slot.scope.tenantId]: [...entries, slot.selectedTemplateId ?? slot.candidates[0]?.template.id].filter((id): id is PlaybookId => Boolean(id)),
    };
  }, {} as Record<string, readonly PlaybookId[]>);
