import { z } from 'zod';
import { withBrand } from '@shared/core';

import type { ConstraintRule, ConstraintType, ConstraintViolation, SimulationProfile, SimulationResult } from './types';

const ConstraintRuleSchema = z.object({
  id: z.string().min(2),
  type: z.enum(['resource', 'time', 'dependency', 'risk', 'compliance'] as const),
  severity: z.enum(['info', 'warning', 'critical'] as const),
  title: z.string().min(3),
  description: z.string().min(3),
  affectedSteps: z.array(z.string().min(1)).default([]),
  tolerance: z.number().min(0).max(1),
});

const SimulationProfileSchema = z.object({
  id: z.string().min(1),
  scenario: z.object({
    id: z.string().min(1),
    tenant: z.string().min(1),
    owner: z.string().min(1),
    title: z.string().min(1),
    window: z.object({
      startAt: z.string(),
      endAt: z.string(),
      timezone: z.string().min(1),
    }),
    steps: z.array(
      z.object({
        id: z.string().min(1),
        phase: z.enum(['preflight', 'injection', 'failover', 'recovery', 'verification'] as const),
        title: z.string().min(1),
        command: z.string().min(1),
        expectedMinutes: z.number().min(0),
        dependencies: z.array(z.string()).default([]),
        constraints: z.array(z.string()).default([]),
      })
    ),
    rules: z.array(ConstraintRuleSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  runId: z.string().min(1),
  region: z.string().min(1),
  blastRadiusScore: z.number().min(0).max(1),
  targetRtoMinutes: z.number().min(1),
  targetRpoMinutes: z.number().min(0),
  concurrencyCap: z.number().min(1).max(20),
});

export const SimulationProfileParseError = Symbol('SimulationProfileParseError');

export const parseSimulationProfile = (value: unknown): SimulationProfile => {
  const parsed = SimulationProfileSchema.parse(value);
  return {
    ...parsed,
    id: withBrand(parsed.id, 'RecoverySimulationId'),
    scenario: {
      ...parsed.scenario,
      id: withBrand(parsed.scenario.id, 'RecoveryScenarioId'),
      tenant: withBrand(parsed.scenario.tenant, 'TenantId'),
    },
    runId: withBrand(parsed.runId, 'RecoveryRunId'),
  };
};

const ruleByType = (rules: readonly ConstraintRule[]) =>
  rules.reduce((acc, rule) => {
    const existing = acc.get(rule.type);
    if (existing) {
      existing.push(rule);
      return acc;
    }
    acc.set(rule.type, [rule]);
    return acc;
  }, new Map<ConstraintType, ConstraintRule[]>());

export const evaluateConstraints = (
  profile: SimulationProfile,
  result: SimulationResult,
): readonly ConstraintViolation[] => {
  const byType = ruleByType(profile.scenario.rules);
  const violations: ConstraintViolation[] = [];

  const byStepDuration = new Map<string, number>();
  for (const sample of result.samples) {
    const current = byStepDuration.get(sample.stepId) ?? 0;
    byStepDuration.set(sample.stepId, current + sample.latencyMs);
  }

  const totalLatency = result.samples.reduce((total, sample) => total + sample.latencyMs, 0);

  for (const rule of byType.get('time') ?? []) {
    const windowMs = new Date(profile.scenario.window.endAt).getTime() - new Date(profile.scenario.window.startAt).getTime();
    const limitMs = windowMs * (1 + rule.tolerance);
    if (totalLatency > limitMs) {
      violations.push({
        ruleId: rule.id,
        stepId: result.stepsExecuted[0] ?? 'unknown',
        message: `${rule.title}: total latency ${totalLatency}ms exceeds budget`,
        scoreImpact: Math.min(1, (totalLatency - limitMs) / (limitMs || 1)),
        observedAt: result.executedAt,
      });
    }
  }

  for (const rule of byType.get('resource') ?? []) {
    const maxPerStepMs = rule.tolerance * 1000 * profile.targetRtoMinutes;
    for (const [stepId, latency] of byStepDuration.entries()) {
      if (latency > maxPerStepMs) {
        violations.push({
          ruleId: rule.id,
          stepId,
          message: `${rule.title}: ${stepId} used ${latency}ms with threshold ${maxPerStepMs}ms`,
          scoreImpact: Math.min(1, latency / (maxPerStepMs || 1)),
          observedAt: result.executedAt,
        });
      }
    }
  }

  for (const rule of byType.get('risk') ?? []) {
    if (result.riskScore > rule.tolerance * 10) {
      violations.push({
        ruleId: rule.id,
        stepId: result.stepsExecuted[result.stepsExecuted.length - 1] ?? 'terminal',
        message: `${rule.title}: risk score ${result.riskScore.toFixed(2)} above risk tolerance`,
        scoreImpact: result.riskScore - rule.tolerance * 10,
        observedAt: result.executedAt,
      });
    }
  }

  const depViolations = profile.scenario.steps.flatMap((step) => {
    return step.dependencies
      .filter((dep) => !result.stepsExecuted.includes(dep))
      .map((dep) => ({
        ruleId: byType.get('dependency')?.[0]?.id ?? 'dependency-missing',
        stepId: step.id,
        message: `${step.title} executed without dependency ${dep}`,
        scoreImpact: 0.2,
        observedAt: result.executedAt,
      }));
  });

  const complianceViolations = byType.get('compliance') ?? [];
  for (const rule of complianceViolations) {
    if (result.readinessAtEnd === 'failed' && rule.severity === 'critical') {
      violations.push({
        ruleId: rule.id,
        stepId: result.stepsExecuted.at(-1) ?? 'end',
        message: `${rule.title}: readiness ended in failed state`,
        scoreImpact: 1,
        observedAt: result.executedAt,
      });
    }
  }

  return [...violations, ...depViolations];
};
