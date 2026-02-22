import type { CommandDefinition, CommandPlanStep, CommandPriority, ScoredCommand, CommandWindow, CommandId } from './types';

export interface PriorityWeights {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export const defaultPriorityWeights: PriorityWeights = {
  critical: 1,
  high: 0.8,
  medium: 0.5,
  low: 0.3,
};

const urgencyMultiplier = (priority: CommandPriority, weights: PriorityWeights): number => {
  return weights[priority] ?? 0;
};

const riskPenalty = (riskWeight: number): number => {
  if (!Number.isFinite(riskWeight) || riskWeight <= 0) {
    return 1;
  }
  if (riskWeight > 1) {
    return 1 / (1 + riskWeight);
  }
  return 1 - riskWeight * 0.15;
};

export const scoreCommand = (command: CommandDefinition, nowIso: string): ScoredCommand<CommandDefinition> => {
  const starts = Date.parse(command.window.startsAt);
  const now = Date.parse(nowIso);
  const urgencyWindow = Number.isFinite(starts) && Number.isFinite(now) ? Math.max(0, (starts - now) / 60_000) : 60;
  const score =
    urgencyMultiplier(command.priority, defaultPriorityWeights) * 100 +
    urgencyWindow * -0.1 +
    command.affectedResources.length * 4 -
    riskPenalty(command.riskWeight) * 10;

  return {
    command,
    score,
    urgency: Math.max(0, Math.min(100, 100 - urgencyWindow * 0.75)),
    risk: command.riskWeight,
  };
};

export const rankCommands = (
  commands: readonly CommandDefinition[],
  nowIso: string = new Date().toISOString(),
): readonly ScoredCommand<CommandDefinition>[] => {
  return commands
    .map((command) => scoreCommand(command, nowIso))
    .sort((left, right) => right.score - left.score);
};

export const assignStepOrder = (commands: readonly ScoredCommand<CommandDefinition>[]): readonly CommandPlanStep[] => {
  let sequence = 1;
  return commands.map((scored) => {
    const step: CommandPlanStep = {
      commandId: scored.command.id,
      commandTitle: scored.command.title,
      sequence,
      canRunWithParallelism: Math.max(1, Math.min(8, Math.floor((1 / Math.max(1, scored.risk) + 1) * 2))),
      status: 'planned',
      scheduledWindow: scored.command.window,
      rationale: `${scored.command.priority} priority with score ${scored.score.toFixed(2)} and urgency ${scored.urgency.toFixed(1)}`,
    };
    sequence += 1;
    return step;
  });
};

export const overlapFraction = (left: CommandWindow, right: CommandWindow): number => {
  const leftStart = Date.parse(left.startsAt);
  const leftEnd = Date.parse(left.endsAt);
  const rightStart = Date.parse(right.startsAt);
  const rightEnd = Date.parse(right.endsAt);

  if ([leftStart, leftEnd, rightStart, rightEnd].some((value) => !Number.isFinite(value))) {
    return 0;
  }

  const start = Math.max(leftStart, rightStart);
  const end = Math.min(leftEnd, rightEnd);
  if (end <= start) return 0;

  const overlap = end - start;
  const leftSpan = leftEnd - leftStart;
  const rightSpan = rightEnd - rightStart;

  if (leftSpan <= 0 || rightSpan <= 0) return 0;
  return overlap / Math.min(leftSpan, rightSpan);
};

export const toDependencyChain = (commands: readonly CommandDefinition[]): readonly CommandId[][] => {
  const byId = new Map<CommandId, CommandDefinition>();
  for (const command of commands) {
    byId.set(command.id, command);
  }

  const visited = new Set<CommandId>();
  const result: CommandId[][] = [];

  for (const command of commands) {
    if (!visited.has(command.id) && command.dependencies.length > 0) {
      const chain: CommandId[] = [];
      const stack: CommandId[] = [...command.dependencies];
      while (stack.length > 0) {
        const head = stack.shift();
        if (!head || chain.includes(head)) continue;
        chain.push(head);
        const next = byId.get(head);
        if (next) {
          stack.push(...next.dependencies);
        }
      }
      visited.add(command.id);
      if (chain.length > 0) {
        result.push(chain);
      }
    }
  }

  return result;
};
