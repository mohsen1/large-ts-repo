import { Optionalize } from '@shared/type-level';

import type {
  RecoveryRunState,
  RecoveryProgram,
  RecoveryCheckpoint,
} from './types';

export interface SlaWindow {
  readonly label: string;
  readonly windowMinutes: number;
  readonly startAt: string;
  readonly endAt: string;
}

export interface SlaSignal {
  readonly source: string;
  readonly score: number;
  readonly rationale: string;
}

export interface SlaAssessment {
  readonly runId: RecoveryRunState['runId'];
  readonly programId: RecoveryProgram['id'];
  readonly meetsSla: boolean;
  readonly slaVarianceMinutes: number;
  readonly riskScore: number;
  readonly violations: readonly SlaSignal[];
}

export interface SlaTolerance {
  readonly criticalWindowMinutes: number;
  readonly warningWindowMinutes: number;
  readonly maxAllowedFailureRate: number;
}

const defaultTolerance: SlaTolerance = {
  criticalWindowMinutes: 30,
  warningWindowMinutes: 90,
  maxAllowedFailureRate: 0.15,
};

export const parseSlaWindow = (window: string): { start: string; end: string; minutes: number } => {
  const split = window.split('/');
  const start = split[0] ?? '';
  const end = split[1] ?? start;
  const startDate = Date.parse(start);
  const endDate = Date.parse(end);
  if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) {
    return { start, end, minutes: 0 };
  }
  return {
    start,
    end,
    minutes: Math.max(0, Math.ceil((endDate - startDate) / 60000)),
  };
};

export const estimateProgramWindowMinutes = (program: RecoveryProgram): number => {
  const start = Date.parse(program.window.startsAt);
  const end = Date.parse(program.window.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.ceil((end - start) / 60000));
};

export const assessSlaCoverage = (
  program: RecoveryProgram,
  run: RecoveryRunState,
  checkpoints: readonly RecoveryCheckpoint[],
  tolerance: Partial<SlaTolerance> = {},
): SlaAssessment => {
  const policy = { ...defaultTolerance, ...tolerance };
  const estimatedWindow = estimateProgramWindowMinutes(program);
  const elapsedMinutes = run.startedAt ? parseWindowMinutes(run.startedAt, new Date().toISOString()) : 0;
  const failures = checkpoints.filter((checkpoint) => checkpoint.exitCode !== 0).length;
  const failureRate = checkpoints.length === 0 ? 0 : failures / checkpoints.length;
  const hasBreached = elapsedMinutes > estimatedWindow + policy.warningWindowMinutes;
  const hasCriticalBreach = elapsedMinutes > estimatedWindow + policy.criticalWindowMinutes;
  const withinWindow = hasCriticalBreach || run.status === 'failed' ? 0 : Math.max(0, 1 - elapsedMinutes / policy.warningWindowMinutes);
  const violations = buildSignals(run, program, hasBreached, hasCriticalBreach, failureRate, policy);
  const riskScore = Number((violations.reduce((acc, signal) => acc + signal.score, 0)).toFixed(4));

  return {
    runId: run.runId,
    programId: program.id,
    meetsSla: violations.length === 0 && run.status !== 'failed',
    slaVarianceMinutes: Math.max(0, elapsedMinutes - estimatedWindow),
    riskScore: Number(Math.min(1, riskScore).toFixed(4)),
    violations,
  };
};

export const compileSlaWindows = (program: RecoveryProgram): readonly SlaWindow[] => {
  const programWindow = estimateProgramWindowMinutes(program);
  const start = new Date(program.window.startsAt);
  const windows: SlaWindow[] = [];

  const warning = {
    start: start.toISOString(),
    end: new Date(start.getTime() + 60 * 1000 * Math.max(1, Math.min(programWindow, 120))).toISOString(),
    minutes: 60,
  };
  windows.push({
    label: 'warning',
    windowMinutes: warning.minutes,
    startAt: warning.start,
    endAt: warning.end,
  });

  const critical = {
    start: start.toISOString(),
    end: new Date(start.getTime() + 60 * 1000 * Math.max(1, Math.floor(programWindow * 1.35))).toISOString(),
    minutes: Math.max(1, Math.floor(programWindow * 1.35)),
  };
  windows.push({
    label: 'critical',
    windowMinutes: critical.minutes,
    startAt: critical.start,
    endAt: critical.end,
  });

  return windows;
};

export const buildSlaPlan = (program: RecoveryProgram, planId: string): Record<string, unknown> => ({
  planId,
  tenant: program.tenant,
  windowMinutes: estimateProgramWindowMinutes(program),
  stepCount: program.steps.length,
  tags: [...program.tags],
  constraints: program.constraints.map((constraint) => ({
    operator: constraint.operator,
    threshold: constraint.threshold,
    name: constraint.name,
  })),
});

export const normalizeAssessment = (
  assessment: SlaAssessment,
): Optionalize<SlaAssessment, 'violations'> => ({
  ...assessment,
  violations: undefined,
});

const buildSignals = (
  run: RecoveryRunState,
  program: RecoveryProgram,
  breached: boolean,
  critical: boolean,
  failureRate: number,
  tolerance: SlaTolerance,
): readonly SlaSignal[] => {
  const signals: SlaSignal[] = [];
  if (run.status === 'failed') {
    signals.push({
      source: 'run-status',
      score: 1,
      rationale: 'run status is failed',
    });
  }

  if (critical) {
    signals.push({
      source: 'time',
      score: 0.9,
      rationale: `elapsed exceeds critical tolerance of ${tolerance.criticalWindowMinutes} minutes`,
    });
  } else if (breached) {
    signals.push({
      source: 'time',
      score: 0.5,
      rationale: `elapsed exceeds warning tolerance of ${tolerance.warningWindowMinutes} minutes`,
    });
  }

  if (failureRate > tolerance.maxAllowedFailureRate) {
    signals.push({
      source: 'checkpoint-failure-rate',
      score: Math.min(1, failureRate),
      rationale: `failure rate ${(failureRate * 100).toFixed(1)}% exceeds ${tolerance.maxAllowedFailureRate * 100}%`,
    });
  }

  if (program.mode === 'emergency' && failureRate > 0.05) {
    signals.push({
      source: 'emergency-mode',
      score: 0.7,
      rationale: 'emergency mode should run with tighter failure tolerance',
    });
  }

  return signals.sort((left, right) => right.score - left.score);
};

const parseWindowMinutes = (start: string, end: string): number => {
  const startTime = Date.parse(start);
  const endTime = Date.parse(end);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) return 0;
  return Math.ceil(Math.max(0, endTime - startTime) / 60000);
};
