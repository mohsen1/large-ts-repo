import type { RecoveryScenario, RecoverySignal, RecoveryAction, ActionId, ScenarioId, SignalId } from './incident-fusion-core';
import { countSignalsByPriority } from './fusion-correlation';

export type ActionWindow = 'immediate' | 'near' | 'planned';
export type ExecutionMode = 'automatic' | 'manual' | 'hybrid';

export interface ActionScheduleRule {
  readonly id: string;
  readonly tenant: string;
  readonly scenarioId: ScenarioId;
  readonly actionId: ActionId;
  readonly window: ActionWindow;
  readonly executionMode: ExecutionMode;
  readonly reasons: readonly string[];
}

export interface ScenarioSchedule {
  readonly scenarioId: ScenarioId;
  readonly rules: readonly ActionScheduleRule[];
  readonly cadenceMinutes: number;
  readonly windowStart: string;
  readonly windowEnd: string;
}

export interface SchedulingContext {
  readonly tenant: string;
  readonly scenario: RecoveryScenario;
  readonly signals: readonly RecoverySignal[];
  readonly actions: readonly RecoveryAction[];
}

export interface SchedulingSummary {
  readonly scenarioId: ScenarioId;
  readonly totalRules: number;
  readonly immediateCount: number;
  readonly manualCount: number;
  readonly autoCount: number;
  readonly cadenceMinutes: number;
}

const clamp = (value: number): number => Math.max(0, Math.min(1, value));

const now = () => new Date().toISOString();

export const createScheduleRules = ({ tenant, scenario, signals, actions }: SchedulingContext): readonly ActionScheduleRule[] => {
  const urgency = countSignalsByPriority(signals);
  const criticalSignals = urgency.critical;
  const highSignals = urgency.high;

  return actions.map((action) => {
    const isBlocking = action.preconditions.length >= 3;
    const isCritical = criticalSignals > 0 || highSignals > 1;
    const isLargeAction = action.estimatedMinutes > 45 || action.dependsOn.length > 3;

    const reasons = [] as string[];
    let window: ActionWindow = 'planned';
    let executionMode: ExecutionMode = 'manual';

    if (isBlocking) {
      reasons.push('action depends on blocking prerequisites');
      window = 'immediate';
    } else if (isCritical) {
      reasons.push('active high-priority signals demand fast response');
      window = 'immediate';
    }

    if (!isBlocking && action.automated && action.estimatedMinutes <= 30) {
      executionMode = 'automatic';
      reasons.push('safe automatic automation criteria met');
      window = 'near';
    }

    if (isLargeAction) {
      executionMode = executionMode === 'automatic' ? 'hybrid' : 'manual';
      reasons.push('operationally complex action requires manual gate');
      if (window === 'immediate') {
        window = 'near';
      }
    }

    if (reasons.length === 0) {
      reasons.push('scheduled by default for routine recovery maintenance');
    }

    return {
      id: `schedule-${action.id}`,
      tenant,
      scenarioId: scenario.id,
      actionId: action.id,
      window,
      executionMode,
      reasons,
    };
  });
};

export const determineCadence = (rules: readonly ActionScheduleRule[]): number => {
  if (rules.length === 0) return 60;
  const immediate = rules.filter((rule) => rule.window === 'immediate').length;
  const ratio = immediate / rules.length;
  const automated = rules.filter((rule) => rule.executionMode === 'automatic').length / rules.length;
  const base = 60 - immediate * 20;
  const adjusted = base - automated * 15;
  return Math.max(5, Math.round(clamp(adjusted) * 55 + 10));
};

export const buildScenarioSchedule = (context: SchedulingContext): ScenarioSchedule => {
  const rules = createScheduleRules(context);
  const cadenceMinutes = determineCadence(rules);
  const start = now();
  const end = new Date(Date.now() + cadenceMinutes * 60_000).toISOString();
  return {
    scenarioId: context.scenario.id,
    rules,
    cadenceMinutes,
    windowStart: start,
    windowEnd: end,
  };
};

export const summarizeScheduling = (scenario: RecoveryScenario, rules: readonly ActionScheduleRule[]): SchedulingSummary => {
  const immediateCount = rules.filter((rule) => rule.window === 'immediate').length;
  const manualCount = rules.filter((rule) => rule.executionMode === 'manual').length;
  const autoCount = rules.filter((rule) => rule.executionMode === 'automatic').length;
  return {
    scenarioId: scenario.id,
    totalRules: rules.length,
    immediateCount,
    manualCount,
    autoCount,
    cadenceMinutes: determineCadence(rules),
  };
};

export const prioritizeRules = (rules: readonly ActionScheduleRule[]): readonly ActionScheduleRule[] => {
  return [...rules].toSorted((left, right) => {
    if (left.window !== right.window) {
      const map: Record<ActionWindow, number> = { immediate: 2, near: 1, planned: 0 };
      return map[right.window] - map[left.window];
    }
    if (left.executionMode !== right.executionMode) {
      const map: Record<ExecutionMode, number> = { manual: 0, hybrid: 1, automatic: 2 };
      return map[right.executionMode] - map[left.executionMode];
    }
    return left.reasons.length - right.reasons.length;
  });
};

export const validateRules = (rules: readonly ActionScheduleRule[]): readonly string[] => {
  const ids = new Set<string>();
  const issues = [] as string[];

  for (const rule of rules) {
    if (ids.has(rule.id)) {
      issues.push(`duplicate rule id: ${rule.id}`);
    }
    ids.add(rule.id);

    if (rule.window === 'immediate' && rule.executionMode === 'automatic') {
      issues.push(`action ${rule.actionId} marked immediate automatic without explicit blast-radius check`);
    }

    if (rule.executionMode === 'automatic' && rule.reasons.length < 2) {
      issues.push(`action ${rule.actionId} should include at least two reasons for automation`);
    }
  }

  return issues;
};

export const mergeRuleSets = (
  left: readonly ActionScheduleRule[],
  right: readonly ActionScheduleRule[],
): readonly ActionScheduleRule[] => {
  const byAction = new Map<string, ActionScheduleRule>();
  for (const rule of [...left, ...right]) {
    const existing = byAction.get(rule.actionId);
    if (!existing || rule.window === 'immediate') {
      byAction.set(rule.actionId, rule);
    }
  }
  return prioritizeRules([...byAction.values()]);
};
