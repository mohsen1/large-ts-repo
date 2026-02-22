import type { Brand } from '@shared/type-level';
import type { SeverityBand, IncidentSignal } from '@domain/recovery-incident-orchestration';
import type {
  CommandPlaybook,
  CommandRunbook,
  CommandTemplate,
  CommandTemplateOptions,
  CommandId,
  SimulationConstraintViolation,
} from './types';

export type PolicyViolationId = Brand<string, 'PolicyViolationId'>;

export interface CommandPolicyRule {
  readonly id: PolicyViolationId;
  readonly name: string;
  readonly description: string;
  readonly blockedSeverities: readonly SeverityBand[];
  readonly maxDurationMinutes: number;
  readonly maxRetry: number;
  readonly requiresReadiness: number;
}

export const criticalityWeights: Readonly<Record<SeverityBand, number>> = {
  low: 0.8,
  medium: 1.1,
  high: 1.5,
  critical: 2.4,
  extreme: 3.2,
};

export interface RiskInput {
  readonly signalDensity: number;
  readonly readiness: number;
  readonly commandCount: number;
  readonly recentFailures: number;
}

export const scoreRisk = (input: RiskInput): number =>
  Math.max(
    0,
    Math.round(
      input.signalDensity * 0.8 +
        input.commandCount * 0.4 +
        input.recentFailures * 2.5 -
        input.readiness * 1.2,
    ),
  );

export const buildCommandTemplatePolicy = (
  template: CommandTemplate,
  options: CommandTemplateOptions,
): CommandPolicyRule[] => [
  {
    id: `${template.name}-duration:${template.id}` as PolicyViolationId,
    name: 'max-duration',
    description: 'Reject playbooks that exceed configured window.',
    blockedSeverities: ['critical', 'extreme'],
    maxDurationMinutes: Math.max(
      template.safetyWindowMinutes,
      options.includeRollbackWindowMinutes,
    ),
    maxRetry: Math.max(0, Math.floor(options.maxRiskScore)),
    requiresReadiness: options.minimumReadinessScore,
  },
  {
    id: `${template.name}-parallel:${template.id}` as PolicyViolationId,
    name: 'parallel-limit',
    description: 'Keep parallelism constrained by policy.',
    blockedSeverities: ['extreme'],
    maxDurationMinutes: options.includeRollbackWindowMinutes + template.safetyWindowMinutes,
    maxRetry: options.maxRiskScore,
    requiresReadiness: options.minimumReadinessScore + 1,
  },
];

export const evaluatePlaybookPolicy = (
  playbook: CommandPlaybook,
  rules: readonly CommandPolicyRule[],
): readonly SimulationConstraintViolation[] => {
  const violations: SimulationConstraintViolation[] = [];
  const maxCommandCount = rules.find((rule) => rule.name === 'max-duration')?.maxDurationMinutes ?? 0;

  if (playbook.commands.length === 0) {
    violations.push({
      commandId: 'empty:playbook' as CommandId,
      reason: 'playbook contains no executable commands',
    });
  }

  const expected = playbook.commands.reduce((total, command) => total + command.expectedDurationMinutes, 0);
  if (expected > maxCommandCount && maxCommandCount > 0) {
    violations.push({
      commandId: playbook.commands[0]?.id ?? ('unknown' as CommandId),
      reason: `expected duration ${expected} exceeds policy max ${maxCommandCount}`,
    });
  }

  for (const command of playbook.commands) {
    const score = criticalityWeights[command.severity] * (command.expectedDurationMinutes / 10);
    if (score > maxCommandCount) {
      violations.push({
        commandId: command.id,
        reason: `command score ${score.toFixed(1)} exceeds threshold ${maxCommandCount}`,
      });
    }
    if (command.actionKind === 'rollback' && command.expectedDurationMinutes > 90) {
      violations.push({
        commandId: command.id,
        reason: 'rollback step exceeds 90-minute cap',
      });
    }
  }

  return violations;
};

export const scorePlaybook = (
  playbook: CommandPlaybook,
  policies: readonly CommandPolicyRule[],
): number => {
  const duration = playbook.commands.reduce((total, command) => total + command.expectedDurationMinutes, 0);
  const policyBias = policies.length * 0.5;
  const commandWeight = playbook.commands.length * 1.3;
  const severityBoost = playbook.commands.reduce((score, command) => score + criticalityWeights[command.severity], 0);
  return Number((duration + commandWeight + severityBoost + policyBias).toFixed(2));
};

export const runbookReadinessScore = (template: CommandTemplate, incidentSignals: readonly IncidentSignal[]): number => {
  const hasSignals = incidentSignals.reduce((sum, signal) => sum + signal.value, 0);
  const activeSignalPenalty = incidentSignals.length === 0 ? 1 : Math.min(4, hasSignals / 100);
  const templateModifier = template.commandHints.length;
  return Math.max(0, Number((templateModifier - activeSignalPenalty).toFixed(2)));
};

export const normalizePolicyDecision = (
  score: number,
  violations: readonly SimulationConstraintViolation[],
): 'allow' | 'warn' | 'block' => {
  if (violations.length > 2) {
    return 'block';
  }
  if (score > 8 || violations.length > 0) {
    return 'warn';
  }
  return 'allow';
};
