import type { CommandConstraint, CommandConstraintContext } from './types';

export interface ConstraintVerdict {
  commandId: string;
  severity: 'block' | 'warn';
  messages: readonly string[];
}

const toReadable = (value: unknown): string =>
  typeof value === 'string' ? value : Array.isArray(value) ? value.join(', ') : JSON.stringify(value);

export const evaluateConstraints = (
  constraints: readonly CommandConstraint[],
  context: CommandConstraintContext,
): ConstraintVerdict[] => {
  const out: ConstraintVerdict[] = [];

  for (const constraint of constraints) {
    const messages = [...constraint.tags.map((tag) => `tag:${tag}`), `load=${context.currentLoad}`];

    const blocked = constraint.hard && (context.currentLoad > 80 || context.activePlanSize > 12);
    const severity: ConstraintVerdict['severity'] = blocked ? 'block' : 'warn';

    if (blocked) {
      out.push({
        commandId: constraint.commandId,
        severity,
        messages: [...messages, constraint.reason, `tenant=${toReadable(context.tenantId)}`],
      });
      continue;
    }

    if (constraint.tags.includes('critical') && context.criticalServices.length > 0) {
      out.push({
        commandId: constraint.commandId,
        severity: 'warn',
        messages: [...messages, 'critical-service overlap', ...context.criticalServices.map((name) => `critical:${name}`)],
      });
    }
  }

  return out;
};

export const isPlanBlockable = (verdicts: readonly ConstraintVerdict[]): boolean => {
  return verdicts.some((entry) => entry.severity === 'block');
};

export const summarizeConstraintMessages = (verdicts: readonly ConstraintVerdict[]): string[] => {
  return verdicts.flatMap((entry) => entry.messages.map((message) => `${entry.commandId}::${message}`));
};
