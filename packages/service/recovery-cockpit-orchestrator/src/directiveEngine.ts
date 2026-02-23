import { PlanId, RecoveryPlan, RuntimeRun } from '@domain/recovery-cockpit-models';
import { buildDependencyInsight } from '@domain/recovery-cockpit-intelligence';
import { evaluatePlanSla } from '@domain/recovery-cockpit-models';
import { summarizePlanHealth, InMemoryCockpitStore } from '@data/recovery-cockpit-store';
import { toPercent, partition } from '@shared/util';

export type RunDirective = {
  readonly planId: PlanId;
  readonly directiveId: string;
  readonly command: string;
  readonly rationale: readonly string[];
  readonly severity: 'info' | 'warn' | 'critical';
  readonly confidence: number;
};

export type DirectiveContext = {
  readonly plan: RecoveryPlan;
  readonly run?: RuntimeRun;
  readonly slaRisk: number;
  readonly slaViolationMinutes: number;
  readonly healthTrend: 'up' | 'flat' | 'down';
  readonly dependencyHealth: ReturnType<typeof buildDependencyInsight>['health'];
  readonly dependencySignals: number;
};

export type PlanDirectiveSummary = {
  readonly planId: PlanId;
  readonly directives: readonly RunDirective[];
  readonly directivesSeverity: 'none' | 'warn' | 'critical';
};

const severityFromScore = (score: number): RunDirective['severity'] => {
  if (score >= 80) return 'critical';
  if (score >= 55) return 'warn';
  return 'info';
};

export const buildDirectiveContext = async (
  store: InMemoryCockpitStore,
  plan: RecoveryPlan,
  run?: RuntimeRun,
): Promise<DirectiveContext> => {
  const sla = evaluatePlanSla(plan);
  const health = await summarizePlanHealth(store, plan.planId);
  const dependencyInsight = buildDependencyInsight(plan);
  const trend = health.ok
    ? health.value.trend
    : 'stable';
  const slaRisk = Number((100 - sla.overallScore).toFixed(2));
  const slaViolationMinutes = Math.max(0, sla.samples.reduce((acc, sample) => acc + Math.max(0, -sample.marginMinutes), 0));

  return {
    plan,
    run,
    slaRisk,
    slaViolationMinutes,
    healthTrend: trend === 'improving' ? 'up' : trend === 'degrading' ? 'down' : 'flat',
    dependencyHealth: dependencyInsight.health,
    dependencySignals: dependencyInsight.recommendation.length,
  };
};

export const buildRunDirectives = (context: DirectiveContext): readonly RunDirective[] => {
  const directives: RunDirective[] = [];

  for (const action of context.plan.actions) {
    directives.push({
      planId: context.plan.planId,
      directiveId: `inspect-${action.id}`,
      command: `observe:${action.command}`,
      rationale: [`service=${action.serviceCode}`, `region=${action.region}`, `duration=${action.expectedDurationMinutes}`],
      severity: 'info',
      confidence: 0.68,
    });
  }

  if (context.slaRisk > 70 || context.slaViolationMinutes > 20) {
    directives.push({
      planId: context.plan.planId,
      directiveId: `sla-${context.plan.planId}`,
      command: 'guard:reduce-parallelism',
      rationale: ['SLA risk crossed threshold'],
      severity: severityFromScore(context.slaRisk),
      confidence: toPercent(Math.min(context.slaRisk, 100), 100) / 100,
    });
  }

  if (context.dependencyHealth !== 'healthy') {
    directives.push({
      planId: context.plan.planId,
      directiveId: `dep-${context.plan.planId}`,
      command: context.dependencyHealth === 'fragile' ? 'guard:serialize-critical-path' : 'hold:all-actions',
      rationale: [
        `dependency=${context.dependencyHealth}`,
        `recommendation=${context.dependencySignals}`,
      ],
      severity: context.dependencyHealth === 'fragile' ? 'warn' : 'critical',
      confidence: context.dependencyHealth === 'fragile' ? 0.62 : 0.89,
    });
  }

  return directives;
};

export const summarizeDirectives = (directives: readonly RunDirective[]): PlanDirectiveSummary => {
  const [warn, stable] = partition(directives, (directive) => directive.severity === 'warn' || directive.severity === 'critical');
  return {
    planId: directives[0]?.planId ?? ('' as PlanId),
    directives,
    directivesSeverity:
      warn.some((directive) => directive.severity === 'critical')
        ? 'critical'
        : warn.length > 0
          ? 'warn'
          : 'none',
  };
};
