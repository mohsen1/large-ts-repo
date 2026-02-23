import { withBrand } from '@shared/core';
import type { Brand } from '@shared/type-level';
import type {
  CommandId,
  CommandRunbook,
  CommandTemplate,
  CommandTemplateOptions,
} from './types';
import { buildExecutionGraph, commandExecutionOrder } from './graph';
import {
  buildCommandSignals,
  buildPlanLabProfile,
  toCandidateEnvelope,
  type CandidateEnvelope,
  type LabCandidateSignal,
} from './lab-types';
import type { LabDiagnostics } from './lab-types';

export interface CommandLabContext {
  readonly runId: Brand<string, 'CommandLabRunId'>;
  readonly tenantId: string;
  readonly planId: string;
  readonly templateId: CommandTemplate['id'];
  readonly createdAt: string;
}

export interface LabCandidate {
  readonly id: CommandId;
  readonly rank: number;
  readonly dependencies: readonly CommandId[];
  readonly readiness: number;
}

export interface OrchestrationBundle {
  readonly runbook: CommandRunbook;
  readonly candidates: readonly LabCandidate[];
  readonly order: readonly CommandId[];
  readonly trace: readonly string[];
  readonly snapshot: string;
}

export interface CommandLabDiagnostics extends LabDiagnostics {
  readonly ready: number;
  readonly envelopeCount: number;
}

export const openLabContext = (
  tenantId: string,
  planId: string,
  template: CommandTemplate,
): CommandLabContext => ({
  runId: withBrand(`${tenantId}:${planId}:${template.id}`, 'CommandLabRunId'),
  tenantId,
  planId,
  templateId: template.id,
  createdAt: new Date().toISOString(),
});

export const rankCommandsForLab = (runbook: CommandRunbook): readonly LabCandidate[] =>
  runbook.playbook.commands
    .map((command, index) => ({
      id: command.id,
      rank: index + 1,
      dependencies: [...command.dependsOn],
      readiness: command.expectedDurationMinutes + command.dependsOn.length + command.label.length,
    }))
    .sort((left, right) => right.readiness - left.readiness);

export const toOrchestrationBundle = (
  runbook: CommandRunbook,
  options: CommandTemplateOptions,
): OrchestrationBundle => {
  const commandGraph = buildExecutionGraph(
    runbook.playbook.commands.map((command) => ({
      id: command.id,
      dependsOn: command.dependsOn,
    })),
    String(runbook.id),
  );

  const order = commandExecutionOrder(commandGraph);
  const candidates = rankCommandsForLab(runbook);
  const profile = buildPlanLabProfile(
    String(runbook.incidentId),
    [runbook],
    [runbook.template],
    Math.max(1, options.maxParallelism),
  );

  const commandSignals = buildCommandSignals(runbook.playbook.commands);
  const rankedSignals = commandSignals
    .slice()
    .sort((left, right) => right.score - left.score)
    .map((signal, index) => toCandidateEnvelope(signal, signal.key, index + 1, {
      window: options.includeRollbackWindowMinutes,
      riskLimit: options.maxRiskScore,
      tenantId: profile.tenantId,
    }));

  const diagnostics: CommandLabDiagnostics = {
    profile,
    topSignals: [...commandSignals],
    rankedCandidates: candidates.map((candidate, index) => ({
      value: runbook.playbook.commands[index] ?? runbook.playbook.commands[0]!,
      score: candidate.readiness,
      rank: candidate.rank,
    })),
    traces: rankedSignals.map((signal, index) => ({
      step: index + 1,
      phase: index % 2 === 0 ? 'policy' : 'execution',
      commandId: candidates[index]?.id ?? runbook.playbook.commands[0]?.id ?? runbook.playbook.commands[0]!,
      impact: signal.value.score,
      notes: [
        `tenant=${profile.tenantId}`,
        `rank=${signal.rank}`,
      ],
    })),
    warnings: [
      `parallelism=${options.maxParallelism}`,
      `readiness=${profile.commandCount}`,
      ...rankedSignals.slice(0, 4).map((signal) => `signal:${signal.id}`),
    ],
    ready: Math.max(0, Math.min(100, 120 - profile.commandCount - options.maxRiskScore)),
    envelopeCount: rankedSignals.length,
  };

  return {
    runbook,
    candidates,
    order,
    trace: diagnostics.topSignals.map((signal) => signal.key),
    snapshot: `commands=${runbook.playbook.commands.length}|candidates=${candidates.length}|state=${runbook.state}`,
  };
};
