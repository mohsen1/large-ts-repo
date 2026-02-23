import { withBrand } from '@shared/core';
import type { Brand } from '@shared/type-level';
import type { CommandRunbook, CommandTemplate, CommandTemplateId, PlaybookId } from './types';

export interface CommandCatalogEntry {
  readonly id: Brand<string, 'CommandCatalogEntry'>;
  readonly templateId: CommandTemplateId;
  readonly planId: PlaybookId;
  readonly commandCount: number;
  readonly lastTouchedAt: string;
}

export interface CommandCatalog {
  readonly entries: readonly CommandCatalogEntry[];
  readonly totalCommands: number;
  readonly generatedAt: string;
}

export interface LabExportToken {
  readonly runbookId: PlaybookId;
  readonly token: string;
  readonly issuedAt: string;
}

export const catalogFromRunbooks = (
  runbooks: readonly CommandRunbook[],
  templates: readonly CommandTemplate[],
  planId: PlaybookId,
): CommandCatalog => {
  const entries = runbooks.map((runbook, index) => ({
    id: withBrand(`${String(planId)}:${index}:${String(runbook.template.id)}`, 'CommandCatalogEntry'),
    templateId: runbook.template.id,
    planId,
    commandCount: runbook.playbook.commands.length,
    lastTouchedAt: new Date().toISOString(),
  }));
  const explicitTemplates = templates.filter((template) => entries.every((entry) => entry.templateId !== template.id));
  return {
    entries: [
      ...entries,
      ...explicitTemplates.map((template) => ({
        id: withBrand(`${String(planId)}:${String(template.id)}`, 'CommandCatalogEntry'),
        templateId: template.id,
        planId,
        commandCount: template.commandHints.length,
        lastTouchedAt: new Date().toISOString(),
      })),
    ],
    totalCommands: entries.reduce((sum, entry) => sum + entry.commandCount, 0),
    generatedAt: new Date().toISOString(),
  };
};

export const buildTokens = (runbook: CommandRunbook): readonly LabExportToken[] =>
  runbook.playbook.commands.map((command) => ({
    runbookId: runbook.id,
    token: `${String(runbook.id)}:${String(command.id)}:${Date.now()}`,
    issuedAt: runbook.playbook.generatedAt,
  }));

export const commandIdsFromRunbook = (runbook: CommandRunbook): readonly string[] =>
  runbook.playbook.commands.map((command) => String(command.id));

export const toRunbookAudit = (runbook: CommandRunbook, operator: string): readonly string[] => [
  `runbook=${String(runbook.id)}`,
  `template=${String(runbook.template.id)}`,
  `tenant=${String(runbook.incidentId)}`,
  `state=${runbook.state}`,
  `operator=${operator}`,
  `commands=${runbook.playbook.commands.length}`,
];
