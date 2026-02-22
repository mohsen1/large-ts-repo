import type { ReadinessDirective, ReadinessSignal, ReadinessTarget, RecoveryReadinessPlan, TimePoint } from './types';
import { ReadinessPolicy } from './policy';
import { calculateWindowDensity } from './schedules';
import { buildSignalMatrix, weightedRiskDensity } from './signal-matrix';
import { foldSignals } from './signals';

export interface SloThreshold {
  label: string;
  min: number;
  max: number;
  band: 'low' | 'amber' | 'red';
}

export interface ReadinessSloContract {
  policyId: ReadinessPolicy['policyId'];
  allowedRegions: ReadonlyArray<string>;
  thresholds: readonly {
    readonly label: string;
    readonly min: number;
    readonly max: number;
    readonly band: 'low' | 'amber' | 'red';
  }[];
  blackoutMinutes: number;
  minTargetCoverage: number;
  maxOpenDirectives: number;
}

export interface SlaViolation {
  readonly code: string;
  readonly at: string;
  readonly message: string;
  readonly severity: 'low' | 'amber' | 'red';
}

export interface ContractSummary {
  readonly runId: string;
  readonly compliant: boolean;
  readonly score: number;
  readonly violations: readonly SlaViolation[];
  readonly targetDensity: number;
}

export function buildSlaContract(policy: ReadinessPolicy, plan: RecoveryReadinessPlan): ReadinessSloContract {
  return {
    policyId: policy.policyId,
    allowedRegions: Array.from(policy.allowedRegions),
    thresholds: [
      { label: 'stability', min: 0, max: 20, band: 'low' },
      { label: 'normal', min: 20, max: 60, band: 'amber' },
      { label: 'critical', min: 60, max: 100, band: 'red' },
    ],
    blackoutMinutes: policy.constraints.maxWindowMinutes,
    minTargetCoverage: policy.constraints.minTargetCoveragePct,
    maxOpenDirectives: policy.constraints.forbidParallelity ? 1 : 8,
  };
}

export function evaluateContractCompliance(params: {
  runId: string;
  plan: RecoveryReadinessPlan;
  signals: readonly ReadinessSignal[];
  directives: readonly ReadinessDirective[];
  targets: readonly ReadinessTarget[];
  policy: ReadinessPolicy;
}): ContractSummary {
  const windowDensity = calculateWindowDensity(
    params.plan.windows.map((window) => ({
      owner: window.label,
      startUtc: window.fromUtc,
      endUtc: window.toUtc,
      capacity: Math.max(1, window.label.length + 1),
    })),
  );
  const violations = [
    ...buildCoverageViolations(params.targets, params.signals, params.policy),
    ...buildWindowViolations(signalsToDensity(params.signals), windowDensity, params.policy),
    ...buildDirectiveViolations(params.directives, params.plan, buildSlaContract(params.policy, params.plan)),
    ...buildSourceViolations(params.signals, params.policy),
  ];

  const summary = foldSignals(params.signals);
  const contract = buildSlaContract(params.policy, params.plan);
  const targetDensity = params.signals.length / Math.max(1, Math.max(1, params.targets.length));
  const severityPenalty = violations.filter((violation) => violation.severity === 'red').length;
  const scoreValue = 100 - violations.length * 8 - severityPenalty * 5 + Math.round(summary.weightedScore * 10);

  return {
    runId: params.runId,
    compliant: violations.length === 0 && severityPenalty === 0,
    score: Number(Math.max(0, scoreValue).toFixed(2)),
    violations,
    targetDensity,
  };
}

export function buildSignalHealthLine(signals: readonly ReadinessSignal[], stepMinutes: number): readonly TimePoint[] {
  if (!signals.length) {
    return [];
  }

  const sorted = [...signals].sort((left, right) => Date.parse(left.capturedAt) - Date.parse(right.capturedAt));
  const origin = Date.parse(sorted[0]!.capturedAt);
  const maxValue = Math.max(...sorted.map((signal) => signal.signalId.length), 1);

  return Array.from({ length: 12 }, (_, index) => {
    const ts = new Date(origin + index * stepMinutes * 60 * 1000).toISOString();
    const pointSignals = sorted.filter((signal) => Date.parse(signal.capturedAt) <= origin + index * stepMinutes * 60000);
    return {
      ts,
      value: Number(((pointSignals.length / Math.max(1, sorted.length)) * maxValue * (index + 1)).toFixed(2)),
    };
  });
}

function signalsToDensity(signals: readonly ReadinessSignal[]): number[] {
  return signals.reduce<number[]>((acc, signal) => {
    const index = Date.parse(signal.capturedAt);
    if (Number.isNaN(index)) {
      return acc;
    }
    acc.push(index);
    return acc;
  }, []);
}

function buildCoverageViolations(
  targets: readonly ReadinessTarget[],
  signals: readonly ReadinessSignal[],
  policy: ReadinessPolicy,
): SlaViolation[] {
  const coveredTargets = new Set(signals.map((signal) => signal.targetId));
  const ratio = coveredTargets.size / Math.max(1, targets.length);
  if (ratio >= policy.constraints.minTargetCoveragePct) {
    return [];
  }

  return [
    {
      code: 'R03_COVERAGE',
      at: new Date().toISOString(),
      message: `coverage ${Math.round(ratio * 100)}% below minimum ${Math.round(policy.constraints.minTargetCoveragePct * 100)}%`,
      severity: ratio > 0.5 ? 'amber' : 'red',
    },
  ];
}

function buildWindowViolations(
  densities: readonly number[],
  density: number,
  policy: ReadinessPolicy,
): SlaViolation[] {
  const weighted = weightedRiskDensity(
    densities.map((value, index) => ({
      signalId: `signal:${index}` as never,
      runId: 'run:unbound' as never,
      targetId: 'target:unbound' as never,
      source: 'telemetry',
      name: `Signal ${index}`,
      severity: value > 80 ? 'critical' : value > 40 ? 'high' : 'low',
      capturedAt: new Date().toISOString(),
      details: {},
    })),
  );

  if (density >= policy.constraints.minTargetCoveragePct && weighted >= 0) {
    return [];
  }

  return [
    {
      code: 'R04_DENSITY',
      at: new Date().toISOString(),
      message: `window density ${density.toFixed(2)} is below contract limit`,
      severity: density < 0.1 ? 'red' : 'amber',
    },
  ];
}

function buildDirectiveViolations(
  directives: readonly ReadinessDirective[],
  plan: RecoveryReadinessPlan,
  contract: ReadinessSloContract,
): SlaViolation[] {
  const active = directives.filter((directive) => directive.enabled).length;
  if (active <= contract.maxOpenDirectives) {
    return [];
  }
  return [
    {
      code: 'R05_DIRECTIVE',
      at: plan.createdAt,
      message: `${active} open directives exceed max ${contract.maxOpenDirectives}`,
      severity: active > contract.maxOpenDirectives * 2 ? 'red' : 'amber',
    },
  ];
}

function buildSourceViolations(signals: readonly ReadinessSignal[], policy: ReadinessPolicy): SlaViolation[] {
  const blocked = signals.filter((signal) => policy.blockedSignalSources.includes(signal.source)).length;
  if (blocked === 0) {
    return [];
  }
  return [
    {
      code: 'R06_SOURCE',
      at: new Date().toISOString(),
      message: `${blocked} blocked-signal sources observed`,
      severity: blocked > 2 ? 'red' : 'amber',
    },
  ];
}
