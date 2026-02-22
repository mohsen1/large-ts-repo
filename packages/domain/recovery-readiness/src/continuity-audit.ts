import type {
  RecoveryReadinessPlan,
  ReadinessDirective,
  ReadinessSignal,
  ReadinessRunId,
} from './types';
import type { ReadinessPolicy } from './policy';

import { foldSignals } from './signals';
import { canRunParallel } from './policy';

export interface AuditRecord {
  readonly runId: ReadinessRunId;
  readonly auditedAt: string;
  readonly status: 'pass' | 'warn' | 'fail';
  readonly checks: readonly AuditCheck[];
}

export interface AuditCheck {
  readonly name: string;
  readonly ok: boolean;
  readonly details: string;
}

export interface PlanAuditInput {
  readonly plan: RecoveryReadinessPlan;
  readonly directives: readonly ReadinessDirective[];
  readonly signals: readonly ReadinessSignal[];
  readonly policy: ReadinessPolicy;
}

function makeRecord(input: PlanAuditInput, checks: readonly AuditCheck[]): AuditRecord {
  const passed = checks.every((check) => check.ok);
  const warn = checks.some((check) => !check.ok);
  const status = passed ? 'pass' : warn ? 'warn' : 'fail';

  return {
    runId: input.plan.runId,
    auditedAt: new Date().toISOString(),
    status,
    checks,
  };
}

export function auditReadinessPlan(input: PlanAuditInput): AuditRecord {
  const checks: AuditCheck[] = [];

  const signalSummary = foldSignals([...input.signals]);
  checks.push({
    name: 'signal-availability',
    ok: input.signals.length > 0,
    details: `signals=${input.signals.length} weighted=${signalSummary.weightedScore}`,
  });

  checks.push({
    name: 'target-coverage',
    ok: input.plan.targets.length > 0,
    details: `targets=${input.plan.targets.length}`,
  });

  checks.push({
    name: 'window-integrity',
    ok: input.plan.windows.length >= Math.max(1, input.plan.targets.length),
    details: `windows=${input.plan.windows.length} targets=${input.plan.targets.length}`,
  });

  checks.push({
    name: 'directive-health',
    ok: input.directives.every((directive) => directive.timeoutMinutes > 0 && directive.enabled),
    details: `enabled=${input.directives.filter((directive) => directive.enabled).length}/${input.directives.length}`,
  });

  const parallel = canRunParallel(input.plan, input.policy);
  checks.push({
    name: 'policy-parallelity',
    ok: input.policy.constraints.forbidParallelity ? !parallel : true,
    details: `parallel=${parallel}`,
  });

  const directiveLinks = input.directives.flatMap((directive) => directive.dependsOn);
  const orphaned = input.directives.filter(
    (directive) =>
      directive.dependsOn.length > 0 &&
      directive.dependsOn.every((dependency) =>
        input.directives.every((candidate) => candidate.directiveId !== dependency.directiveId),
      ),
  ).length;

  checks.push({
    name: 'dependency-resolution',
    ok: orphaned === 0,
    details: `orphan-dependencies=${orphaned} links=${directiveLinks.length}`,
  });

  const risk = input.signals.reduce((max, signal) => ({
    ...max,
    [signal.signalId]: signal.severity,
  }), {} as Record<ReadinessSignal['signalId'], ReadinessSignal['severity']>);

  checks.push({
    name: 'severity-diversity',
    ok: Object.values(risk).length >= 1,
    details: `unique=${Object.keys(risk).length}`,
  });

  const allChecks = checks.map((check) => ({
    ...check,
    details: check.details || `${check.name} ok`,
  }));
  return makeRecord(input, allChecks);
}

export function summarizeAudits(records: readonly AuditRecord[]): {
  readonly passRate: number;
  readonly failRate: number;
  readonly warningRate: number;
} {
  const total = records.length;
  if (!total) {
    return { passRate: 0, failRate: 0, warningRate: 0 };
  }

  const passRate = records.filter((record) => record.status === 'pass').length / total;
  const failRate = records.filter((record) => record.status === 'fail').length / total;

  return {
    passRate: Number(passRate.toFixed(3)),
    failRate: Number(failRate.toFixed(3)),
    warningRate: Number((1 - passRate - failRate).toFixed(3)),
  };
}
