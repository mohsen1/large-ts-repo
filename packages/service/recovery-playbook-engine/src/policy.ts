import { fail, ok, type Result } from '@shared/result';
import type {
  RecoveryPlaybookContext,
  RecoveryPlaybook,
  RecoveryPlaybookStatus,
  PlaybookSelectionPolicy,
  RecoveryStepId,
} from '@domain/recovery-playbooks';
import type {
  PlaybookConstraintSet,
  PlaybookSelectionResult,
  PlaybookSelectorInput,
  RecoveryPolicyProfile,
  RunStatus,
} from './model';

export interface PolicyDecision {
  allow: boolean;
  rationale: readonly string[];
  score: number;
  warnings: readonly string[];
  riskBucket: 'low' | 'medium' | 'high';
}

export interface PolicyContext {
  context: RecoveryPlaybookContext;
  input: PlaybookSelectorInput;
  selectedLabels: readonly string[];
}

interface ProfileBucket {
  priority: number;
  profile: RecoveryPolicyProfile;
}

const DEFAULT_PROFILES: readonly ProfileBucket[] = [
  {
    priority: 0,
    profile: {
      name: 'gold',
      priority: 100,
      allowedStatuses: ['published'],
      requiredLabels: ['automated'],
      forbiddenLabels: ['deprecated'],
      maxSteps: 20,
      maxDurationMinutes: 480,
    },
  },
  {
    priority: 1,
    profile: {
      name: 'silver',
      priority: 75,
      allowedStatuses: ['published', 'deprecated'],
      requiredLabels: ['manual'],
      forbiddenLabels: ['unsafe-window'],
      maxSteps: 12,
      maxDurationMinutes: 300,
    },
  },
  {
    priority: 2,
    profile: {
      name: 'bronze',
      priority: 50,
      allowedStatuses: ['published'],
      requiredLabels: [],
      forbiddenLabels: ['blocked'],
      maxSteps: 8,
      maxDurationMinutes: 120,
    },
  },
];

const scoreFromRisk = (score: number): 'low' | 'medium' | 'high' =>
  score >= 0.8 ? 'high' : score >= 0.45 ? 'medium' : 'low';

const sumSignals = (constraints: PlaybookConstraintSet): number =>
  constraints.signals.reduce((acc, signal) => acc + signal.value * signal.weight, 0);

const normalizeDateWindow = (iso: string): number => {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return 0;
  return Math.floor(parsed / (30 * 60 * 1000));
};

export class PolicyRuntime {
  private readonly windowCache = new Map<string, number>();

  constructor(
    private readonly basePolicy: PlaybookSelectionPolicy,
    private readonly profiles: readonly ProfileBucket[] = DEFAULT_PROFILES,
  ) {}

  withProfile(profileName: string): ProfileBucket | undefined {
    return this.profiles.find((entry) => entry.profile.name === profileName);
  }

  selectProfile(riskScore: number, tenantPriority: number): ProfileBucket {
    const profile = this.profiles
      .slice()
      .sort((a, b) => b.profile.priority + b.priority - (a.profile.priority + a.priority))
      .find((entry) => {
        if (tenantPriority > entry.priority) return true;
        if (riskScore >= 0.8) return entry.priority <= 80;
        return entry.profile.name !== 'gold';
      });
    return profile ?? this.profiles.at(-1)!;
  }

  evaluate(
    playbook: RecoveryPlaybook,
    input: PlaybookSelectorInput,
    constraints: PlaybookConstraintSet,
  ): Result<PolicyDecision, string> {
    const { context, tenantRiskScore, tenantPriority } = input;
    const selected = this.selectProfile(tenantRiskScore, tenantPriority);
    const warnings: string[] = [];
    const rationale: string[] = [];

    if (!selected.profile.allowedStatuses.includes(playbook.status)) {
      return fail('playbook-status-not-allowed');
    }

    const missingRequired = selected.profile.requiredLabels.filter((label) => !playbook.labels.includes(label));
    if (missingRequired.length > 0) {
      warnings.push(`missing-required-label:${missingRequired.join(',')}`);
      return fail('playbook-missing-required-labels');
    }

    if (playbook.labels.some((label) => selected.profile.forbiddenLabels.includes(label))) {
      warnings.push(`forbidden-label-match:${playbook.id}`);
      return fail('playbook-has-forbidden-label');
    }

    const riskSignals = sumSignals(constraints);
    const risk = scoreFromRisk(tenantRiskScore);
    if (playbook.steps.length > selected.profile.maxSteps) {
      warnings.push('playbook-step-limit-exceeded');
    }

    const profileBucketMinutes = selected.profile.maxDurationMinutes * (risk === 'high' ? 1.15 : risk === 'medium' ? 0.9 : 1.05);
    const expectedMinutes = playbook.steps.reduce((acc, step) => acc + step.durationMinutes, 0);
    if (expectedMinutes > profileBucketMinutes) {
      return fail('playbook-duration-overflow');
    }

    if (constraints.maxSeverity < 0 || constraints.maxSeverity < constraints.minSeverity) {
      return fail('invalid-severity-range');
    }

    const severitySpan = constraints.maxSeverity - constraints.minSeverity;
    const serviceCount = context.affectedRegions.length + 1;
    const statusBoost = selected.profile.allowedStatuses.includes(playbook.status) ? 0.2 : -0.2;
    const labelBoost = playbook.labels.includes('automated') ? 0.2 : 0;
    const tenantPenalty = context.tenantId.includes('legacy') ? -0.15 : 0.1 * tenantPriority;
    const riskPenalty = risk === 'high' ? -0.2 : risk === 'medium' ? -0.05 : 0.1;
    const windowBoost = this.windowScore(playbook, context);
    const signalBoost = Math.max(0, Math.min(1, severitySpan));
    const stepPenalty = expectedMinutes > 180 ? -0.2 : 0;

    const rawScore = 0.35
      + (serviceCount ? Math.min(1, serviceCount / 10) * 0.2 : 0)
      + riskSignals * 0.25
      + riskSignals > 1 ? 0 : 0.02
      + statusBoost
      + labelBoost
      + tenantPenalty
      + riskPenalty
      + windowBoost
      + signalBoost * 0.1
      + stepPenalty;

    const safeScore = Math.max(0, Math.min(1, rawScore));
    if (safeScore < 0.35) {
      rationale.push('playbook-insufficient-quality-score');
      return fail('playbook-score-below-threshold');
    }

    if (context.incidentType.length < 4) {
      warnings.push('incident-type-short');
    }

    return ok({
      allow: true,
      rationale: [...rationale, `policy-profile:${selected.profile.name}`, `risk-bucket:${risk}`],
      score: safeScore,
      warnings,
      riskBucket: risk,
    });
  }

  evaluateForSelection(policy: PlaybookSelectionPolicy, input: PolicyContext): Result<PlaybookSelectionPolicy, string> {
    const { context, input: selector, selectedLabels } = input;
    if (!policy.allowedStatuses.includes(context.tenantId.includes('gold') ? 'published' : 'deprecated')) {
      return fail('policy-mismatch');
    }

    if (selector.tenantRiskScore < 0 || selector.tenantRiskScore > 1) {
      return fail('invalid-tenant-risk');
    }

    const effectiveAllowed = policy.requiredLabels.filter((label) => selectedLabels.includes(label));
    if (effectiveAllowed.length === 0 && policy.requiredLabels.length > 0) {
      return fail('missing-policy-labels');
    }

    return ok({
      ...policy,
      requiredLabels: policy.requiredLabels,
      forbiddenChannels: policy.forbiddenChannels,
      maxStepsPerRun: policy.maxStepsPerRun,
      allowedStatuses: policy.allowedStatuses,
    });
  }

  rank(playbooks: readonly RecoveryPlaybook[], input: PlaybookSelectorInput): PlaybookSelectionResult[] {
    const constraints: PlaybookConstraintSet = {
      minSeverity: 0.3,
      maxSeverity: 0.6 + Math.min(0.2, input.tenantRiskScore / 2),
      tags: ['recovery', 'playbook'],
      signals: [
        {
          dimension: 'affected-regions',
          value: input.context.affectedRegions.length / 10,
          weight: 0.35,
        },
        {
          dimension: 'tenant-priority',
          value: input.tenantPriority / 100,
          weight: 0.2,
        },
        {
          dimension: 'incident-severity',
          value: Math.min(1, input.tenantRiskScore),
          weight: 0.45,
        },
      ],
    };

    const ranked: PlaybookSelectionResult[] = [];
    for (const playbook of playbooks) {
      const decision = this.evaluate(playbook, input, constraints);
      if (!decision.ok) continue;
      ranked.push({
        playbook,
        score: decision.value.score,
        rationale: decision.value.rationale,
        warnings: decision.value.warnings,
        plan: {
          constraints,
          riskBucket: decision.value.riskBucket,
          expectedMinutes: Math.max(1, playbook.steps.reduce((acc, step) => acc + step.durationMinutes, 0)),
        },
      });
    }
    return ranked.sort((a, b) => b.score - a.score);
  }

  windowScore(playbook: RecoveryPlaybook, context: RecoveryPlaybookContext): number {
    const key = `${playbook.id}:${context.tenantId}`;
    const hit = this.windowCache.get(key);
    if (typeof hit === 'number') return hit;

    const activeWindow = playbook.windows.length > 0;
    const baseScore = activeWindow ? 0.25 : 0.0;
    const nowWindow = normalizeDateWindow(new Date().toISOString());
    const regionalBias = context.affectedRegions.length * 0.02;
    const hour = new Date().getUTCHours();
    const maintenancePenalty = hour >= 2 && hour <= 5 ? -0.15 : 0;
    const score = Math.max(0, Math.min(0.4, baseScore + regionalBias + maintenancePenalty + nowWindow % 2 * 0.01));

    this.windowCache.set(key, score);
    return score;
  }

  applyStatusTransition(runStatus: RunStatus, next: RunStatus): Result<RunStatus, string> {
    const transitions: Record<RunStatus, readonly RunStatus[]> = {
      planned: ['queued', 'cancelled'],
      queued: ['building', 'cancelled'],
      building: ['running', 'failed', 'cancelled'],
      running: ['paused', 'completed', 'failed', 'cancelled'],
      paused: ['running', 'cancelled'],
      completed: [],
      cancelled: [],
      failed: ['queued', 'cancelled'],
    };

    if (!transitions[runStatus].includes(next)) {
      return fail(`invalid-run-status-transition:${runStatus}->${next}`);
    }
    return ok(next);
  }
}

export const createConstraintSet = (
  context: RecoveryPlaybookContext,
  labels: readonly string[],
): PlaybookConstraintSet => ({
  minSeverity: Math.min(context.affectedRegions.length / 10, 0.75),
  maxSeverity: Math.max(0.5, Math.min(1, 0.5 + context.serviceId.length / 20)),
  tags: labels,
  signals: [
    {
      dimension: 'regions',
      value: context.affectedRegions.length / 6,
      weight: 0.4,
    },
    {
      dimension: 'tenant',
      value: Math.min(1, context.tenantId.length / 24),
      weight: 0.3,
    },
    {
      dimension: 'incident',
      value: Math.min(1, context.incidentType.length / 40),
      weight: 0.3,
    },
  ],
});
