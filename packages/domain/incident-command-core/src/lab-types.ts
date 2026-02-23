import { withBrand } from '@shared/core';
import type { Brand, DeepReadonly } from '@shared/type-level';
import type {
  CommandPlaybook,
  CommandPlaybookCommand,
  CommandTemplate,
  CommandTemplateId,
  CommandId,
  CommandState,
  CommandRunbook,
  PlaybookSimulation,
  PlaybookId,
} from './types';
import type { IncidentId } from '@domain/recovery-incident-orchestration';

export type RankedCollection<T> = readonly { readonly value: T; readonly score: number; readonly rank: number }[];

export interface PlanLabProfile {
  readonly planId: Brand<string, 'PlanLabProfile'>;
  readonly tenantId: string;
  readonly commandCount: number;
  readonly runbooks: readonly CommandRunbook[];
  readonly templateIds: readonly CommandTemplateId[];
  readonly windowMinutes: number;
  readonly createdAt: string;
}

export interface CandidateEnvelope<T> {
  readonly id: Brand<string, 'CandidateEnvelope'>;
  readonly value: T;
  readonly rank: number;
  readonly context: Record<string, string | number | boolean>;
}

export interface SimulationTrace {
  readonly step: number;
  readonly phase: string;
  readonly commandId: CommandId;
  readonly impact: number;
  readonly notes: readonly string[];
}

export interface LabDiagnostics {
  readonly profile: PlanLabProfile;
  readonly topSignals: readonly LabCandidateSignal[];
  readonly rankedCandidates: RankedCollection<CommandPlaybookCommand>;
  readonly traces: readonly SimulationTrace[];
  readonly warnings: readonly string[];
}

export interface PlanReadiness {
  readonly tenantId: string;
  readonly commandPlan: CommandPlaybook;
  readonly readiness: number;
  readonly risk: number;
  readonly blockers: readonly string[];
  readonly constraints: readonly string[];
}

export interface LabCandidateSignal {
  readonly key: string;
  readonly score: number;
  readonly normalized: number;
  readonly metadata: Record<string, string | number | boolean>;
}

export const buildPlanLabProfile = (
  tenantId: string,
  runbooks: readonly CommandRunbook[],
  templates: readonly CommandTemplate[],
  windowMinutes: number,
): PlanLabProfile => ({
  planId: withBrand(`${tenantId}:${windowMinutes}:${runbooks.length}`, 'PlanLabProfile'),
  tenantId,
  commandCount: runbooks.reduce((sum, runbook) => sum + runbook.playbook.commands.length, 0),
  runbooks: [...runbooks],
  templateIds: [...templates].map((template) => template.id),
  windowMinutes,
  createdAt: new Date().toISOString(),
});

export const normalizeBucket = (value: number, total: number): number =>
  total <= 0 ? 0 : Number((value / total).toFixed(4));

export const toCandidateEnvelope = <T>(
  value: T,
  seed: string,
  rank: number,
  context: Record<string, string | number | boolean>,
): CandidateEnvelope<T> => ({
  id: withBrand(`${seed}:${rank}`, 'CandidateEnvelope'),
  value,
  rank,
  context,
});

export const rankByReadiness = (values: readonly number[]): RankedCollection<number> =>
  [...values]
    .map((value, index) => ({ value, score: value, rank: index + 1 }))
    .sort((left, right) => right.score - left.score || left.value - right.value);

export const foldViolations = (
  violations: readonly { commandId: CommandId; reason: string }[],
): readonly string[] =>
  violations.map((entry) => `${String(entry.commandId)}:${entry.reason}`);

export const buildCommandSignals = (commands: readonly CommandPlaybookCommand[]): readonly LabCandidateSignal[] =>
  commands.map((command, index) => ({
    key: String(command.id),
    score: command.expectedDurationMinutes + command.dependsOn.length + command.label.length,
    normalized: normalizeBucket(index + 1, Math.max(1, commands.length)),
    metadata: {
      severity: command.severity,
      owner: command.owner,
      rank: index,
    },
  }));

export const mapSimulationFrame = (
  simulation: PlaybookSimulation,
  index: number,
): SimulationTrace => {
  const commandId = simulation.frameOrder[index] ?? simulation.runbook.playbook.commands[0]?.id ?? simulation.runbook.id;
  return {
    step: index + 1,
    phase: index % 2 === 0 ? 'policy' : 'execution',
    commandId,
    impact: simulation.violations.length + index,
    notes: [
      `parallelism=${simulation.parallelism}`,
      `violations=${simulation.violations.length}`,
    ],
  };
};

export const evaluateSimulationRisk = (simulation: PlaybookSimulation): number =>
  simulation.violations.length * 5 + simulation.parallelism + simulation.expectedFinishAt.length * 0.1;

export const buildPlanReadiness = (
  command: CommandPlaybookCommand,
  incidentsPlan: readonly { incidentId: string }[],
): PlanReadiness => {
  const planIncidentId = incidentsPlan[0]?.incidentId ?? String(command.id);
  const readiness = Math.max(0, 100 - command.expectedDurationMinutes);
  const risk = command.expectedDurationMinutes / Math.max(1, command.dependsOn.length + 1);
  const constraints = Object.entries(command.metadata)
    .filter(([, value]) => String(value).length > 0)
    .map(([key]) => key);

  return {
    tenantId: String(planIncidentId),
    commandPlan: {
      id: withBrand(`${String(command.id)}:${command.owner}:playbook`, 'PlaybookId'),
      incidentId: planIncidentId as any,
      templateName: command.label,
      templateVersion: 'v1',
      commands: [command],
      constraints: {
        requiresHumanApproval: command.expectedDurationMinutes > 60,
        maxRetryAttempts: Math.min(3, command.dependsOn.length + 1),
        backoffMinutes: command.label.length,
        abortOnFailure: false,
        allowedRegions: ['global'],
      },
      generatedAt: new Date().toISOString(),
    },
    readiness,
    risk,
    blockers: command.dependsOn.map(String),
    constraints,
  };
};

export const describeCandidateSignals = (signals: readonly LabCandidateSignal[]): readonly string[] =>
  signals.map((signal) => `${signal.key}:${signal.score.toFixed(2)}:${signal.normalized.toFixed(2)}`);

export const estimateReadiness = (runbooks: readonly CommandRunbook[], windowMinutes: number): number => {
  const totalCommands = runbooks.reduce((sum, runbook) => sum + runbook.playbook.commands.length, 0);
  const safeguards = runbooks.flatMap((runbook) => runbook.playbook.commands)
    .filter((command) => command.actionKind === 'safeguard').length;
  const signalPressure = runbooks.reduce((sum, runbook) => sum + runbook.riskScore, 0);
  const base = windowMinutes > 0 ? 100 : 0;
  return Number((base - totalCommands - safeguards * 2 - signalPressure).toFixed(2));
};
