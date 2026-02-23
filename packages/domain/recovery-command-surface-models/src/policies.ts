import type { SurfacePlan, SurfacePolicy, SurfaceRule, SurfaceRun, SurfaceForecast, SurfaceSignal, ActionKind, SurfaceRunStep } from './types';

export interface RuleHit {
  readonly ruleId: string;
  readonly commandId?: string;
  readonly name: string;
  readonly value: number;
  readonly maxValue: number;
}

export interface ForecastInput {
  readonly run: SurfaceRun;
  readonly policy: SurfacePolicy;
  readonly signalWindow: readonly SurfaceSignal[];
  readonly commandKinds: readonly ActionKind[];
}

export const applyPolicy = (plan: SurfacePlan, policy: SurfacePolicy): SurfacePolicy => {
  if (!policy.enabled) {
    return { ...policy, rules: [] };
  }
  const allowedKindCount = policy.rules.reduce((sum, rule) => sum + rule.appliesToKind.length, 0);
  const maxRisk = policy.rules.reduce((sum, rule) => sum + rule.maxRiskThreshold, 0);
  const adjusted: SurfaceRule[] = policy.rules.filter((rule, index) => {
    if (index % 4 === 0 && maxRisk > 100) return false;
    if (rule.minSignalRatio < 0.5) return false;
    return allowedKindCount > 0;
  });
  return {
    ...policy,
    rules: adjusted,
  };
};

export const evaluateRuleMatches = (plan: SurfacePlan, run: SurfaceRun, rules: readonly SurfaceRule[]): readonly RuleHit[] => {
  const latestRisk = run.steps.length + run.signals.length;
  const commandCount = plan.commands.length;
  return rules.map((rule, index) => {
    const matched = plan.commands.some((command) => rule.appliesToKind.includes(command.kind));
    const factor = matched ? 1 : 0;
    return {
      ruleId: `${rule.id}-${index}`,
      commandId: plan.commands[index % commandCount]?.id,
      name: rule.name,
      value: latestRisk + factor,
      maxValue: commandCount + rule.minSignalRatio * 100,
    };
  });
};

export const forecastReadiness = (
  input: ForecastInput,
): SurfaceForecast => {
  const signalLoad = input.signalWindow.length === 0 ? 1 : input.signalWindow.reduce((sum, signal) => sum + signal.value, 0);
  const policyPressure = input.policy.enabled ? input.policy.rules.length : 0;
  const commandFactor = input.commandKinds.length;
  const confidence = Math.min(100, Math.max(35, 100 - policyPressure * 4 - commandFactor));
  const projectedRecoveryMinutes = Math.max(
    1,
    Math.floor((input.run.steps.length + signalLoad / 10 + policyPressure * 2) / 2),
  );
  const projectedSloRisk = Math.max(
    0,
    Math.min(100, Math.floor((input.run.riskScore + commandFactor) * 1.25)),
  );
  const recommendedBatchCount = Math.max(1, Math.min(5, Math.floor((input.policy.rules.length + 2) / 3)));
  return {
    runId: input.run.id,
    confidence,
    projectedSloRisk,
    projectedRecoveryMinutes,
    recommendedBatchCount,
  };
};

export const filterRunActions = (run: SurfaceRun, allowedStates: readonly SurfaceRun['state'][]): readonly SurfaceRunStep[] => {
  return run.steps.filter((step) => allowedStates.includes(step.state));
};

export const isHealthyRun = (run: SurfaceRun, threshold: number): boolean => {
  const warningRatio = run.steps.length === 0 ? 0 : (run.steps.filter((step) => step.state === 'failed').length / run.steps.length) * 100;
  return warningRatio < threshold && run.riskScore < 80;
};
