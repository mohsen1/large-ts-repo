import type { RecoveryPlaybook, RecoveryPlaybookQuery, RecoveryPlaybookStatus } from '@domain/recovery-playbooks';
import { withBrand } from '@shared/core';
import type { PlaybookLabCandidate, PlaybookLabProfileVersion, CampaignLane, PlaybookLabTenantId } from '@domain/recovery-playbook-lab';
import { buildRecoverySignalIndex } from './playbookLabSignalUtils';

export interface PolicyEnvelope {
  readonly tenantId: PlaybookLabTenantId;
  readonly policyId: string;
  readonly allowedStatus: readonly RecoveryPlaybookStatus[];
  readonly maxCandidates: number;
  readonly requiredSignals: readonly string[];
  readonly maxPlanMinutes: number;
  readonly lanes: readonly CampaignLane[];
  readonly minForecast: number;
  readonly maxForecast: number;
  readonly profileVersion: PlaybookLabProfileVersion;
}

export interface PolicyIssue {
  readonly code: 'tenant-violation' | 'status-violation' | 'signal-violation' | 'lane-violation';
  readonly message: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface PolicyDecision<T> {
  readonly allowed: boolean;
  readonly issues: readonly PolicyIssue[];
  readonly value: T;
}

export interface PlaybookLabFilterInput {
  readonly query: RecoveryPlaybookQuery;
  readonly policy: PolicyEnvelope;
}

export interface PlaybookLabValidationEnvelope {
  readonly campaignVersion: PlaybookLabProfileVersion;
  readonly maxStepBudget: number;
  readonly maxAllowedDurationMinutes: number;
  readonly preferredLanes: readonly CampaignLane[];
}

const createPolicyId = (tenant: PlaybookLabTenantId): string =>
  withBrand(`policy:${String(tenant)}:${Date.now()}`, 'RecoveryPlaybookId');

const toIssue = (
  code: PolicyIssue['code'],
  message: string,
  metadata: Readonly<Record<string, unknown>>,
): PolicyIssue => ({ code, message, metadata });

const defaultProfileVersion = (tenant: PlaybookLabTenantId): PlaybookLabProfileVersion => `v${Math.max(1, String(tenant).length % 3 + 1)}` as PlaybookLabProfileVersion;

export const createDefaultPlaybookLabPolicy = (tenantId: PlaybookLabTenantId): PolicyEnvelope => ({
  tenantId,
  policyId: createPolicyId(tenantId),
  allowedStatus: ['published'],
  maxCandidates: 30,
  requiredSignals: ['ops', 'telemetry'],
  maxPlanMinutes: 180,
  lanes: ['recovery', 'compliance'],
  minForecast: 0.2,
  maxForecast: 1,
  profileVersion: defaultProfileVersion(tenantId),
});

const isAllowedTenant = (candidateTenant: PlaybookLabTenantId | string, expected: PlaybookLabTenantId): boolean =>
  String(candidateTenant) === String(expected);

const isAllowedStatus = (status: RecoveryPlaybookStatus, allowed: readonly RecoveryPlaybookStatus[]): boolean =>
  allowed.includes(status);

const isAllowedLane = (candidateLane: CampaignLane, lanes: readonly CampaignLane[]): boolean =>
  lanes.includes(candidateLane);

const clampForecast = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;

export const evaluateQuery = ({ query, policy }: PlaybookLabFilterInput): PolicyDecision<RecoveryPlaybookQuery> => {
  const issues: PolicyIssue[] = [];
  const tenantMismatch = String(query.tenantId) !== String(policy.tenantId);
  if (tenantMismatch) {
    issues.push(toIssue('tenant-violation', 'query tenant does not match policy tenant', {
      expectedTenant: policy.tenantId,
      actualTenant: query.tenantId,
    }));
  }

  if (query.limit && query.limit > policy.maxCandidates) {
    issues.push(toIssue('status-violation', `query limit reduced from ${query.limit} to ${policy.maxCandidates}`, {
      requestedLimit: query.limit,
      allowedLimit: policy.maxCandidates,
    }));
  }

  const adjustedQuery: RecoveryPlaybookQuery = {
    ...query,
    status: (query.status as RecoveryPlaybookStatus | undefined) ?? 'published',
    limit: Math.min(query.limit ?? policy.maxCandidates, policy.maxCandidates),
    labels: query.labels?.length ? query.labels : ['automated'],
    categories: query.categories?.length ? query.categories : ['recovery'],
    severityBands: query.severityBands?.length ? query.severityBands : ['p0', 'p1'],
  };

  if (adjustedQuery.status && !policy.allowedStatus.includes(adjustedQuery.status)) {
    issues.push(toIssue('status-violation', 'query status adjusted to policy default', {
      requestedStatus: adjustedQuery.status,
      fallbackStatus: 'published',
    }));
    adjustedQuery.status = 'published';
  }

  return {
    allowed: !tenantMismatch,
    issues,
    value: adjustedQuery,
  };
};

export const validateCandidateList = (
  tenantId: PlaybookLabTenantId,
  candidates: readonly RecoveryPlaybook[],
  policy: PolicyEnvelope,
): PolicyDecision<readonly RecoveryPlaybook[]> => {
  const issues: PolicyIssue[] = [];
  const valid: RecoveryPlaybook[] = [];
  for (const candidate of candidates) {
    if (!isAllowedTenant(candidate.owner, tenantId)) {
      issues.push(toIssue('tenant-violation', `candidate tenant mismatch ${String(candidate.owner)} vs ${String(tenantId)}`, {
        candidateId: candidate.id,
      }));
      continue;
    }
    if (!isAllowedStatus(candidate.status, policy.allowedStatus)) {
      issues.push(toIssue('status-violation', `status ${candidate.status} not allowed`, {
        candidateId: candidate.id,
        status: candidate.status,
      }));
      continue;
    }
    valid.push(candidate);
  }
  return {
    allowed: valid.length > 0,
    issues,
    value: valid,
  };
};

export const mapToCandidates = (
  tenantId: PlaybookLabTenantId,
  playbooks: readonly RecoveryPlaybook[],
  policy: PolicyEnvelope,
): PolicyDecision<readonly PlaybookLabCandidate[]> => {
  const issues: PolicyIssue[] = [];
  const candidates: PlaybookLabCandidate[] = [];
  const signalIndex = buildRecoverySignalIndex(policy.requiredSignals);
  for (const [index, playbook] of playbooks.entries()) {
    if (!signalIndex.playbookSignals[index % signalIndex.playbookSignals.length]) {
      issues.push(toIssue('signal-violation', 'missing expected signal coverage', {
        playbookId: playbook.id,
      }));
      continue;
    }
    const lane = policy.lanes[index % policy.lanes.length] ?? 'recovery';
    if (!isAllowedLane(lane, policy.lanes)) {
      issues.push(toIssue('lane-violation', 'lane not allowed', { lane, candidateId: playbook.id }));
      continue;
    }
    candidates.push({
      campaign: withBrand(`candidate:${String(playbook.id)}:${index}`, 'PlaybookLabCampaignId'),
      playbook,
      query: {
        tenantId,
        status: playbook.status,
        labels: ['recovery-lab'],
      },
      plan: {
        id: withBrand(`plan:${String(playbook.id)}:${index}`, 'RecoveryPlanId'),
        runId: withBrand(`run:${String(playbook.id)}:${index}`, 'RecoveryRunId'),
        playbookId: playbook.id,
        status: 'pending',
        selectedStepIds: playbook.steps.slice(0, 5).map((step) => step.id),
        startedAt: undefined,
        completedAt: undefined,
        operator: String(tenantId),
        telemetry: {
          attempts: 0,
          failures: 0,
          recoveredStepIds: [],
        },
      },
      lane,
      estimatedRecoveryTimeMinutes: playbook.steps.length + index,
      forecastConfidence: clampForecast(playbook.steps.length / 30, policy.minForecast, policy.maxForecast),
      constraintsSatisfied: true,
      riskEnvelope: {
        score: Number(Math.max(0.1, Math.min(1, signalIndex.globalCoverage[index % signalIndex.globalCoverage.length]))),
        budget: Math.max(1, 100 - index),
        rationale: ['policy:mapped', `index=${index}`],
        signals: ['policy:mapped', String(tenantId)],
      },
      reasons: ['policy:mapped', `index=${index}`],
    });
  }
  return {
    allowed: candidates.length > 0,
    issues,
    value: candidates,
  };
};

export const buildValidationEnvelope = (policy: PolicyEnvelope): PlaybookLabValidationEnvelope => {
  const maxMinutes = policy.maxPlanMinutes;
  return {
    campaignVersion: policy.profileVersion,
    maxStepBudget: Math.max(1, Math.floor(maxMinutes / 2)),
    maxAllowedDurationMinutes: maxMinutes,
    preferredLanes: [...policy.lanes],
  };
};

export const summarizePolicy = (policy: PolicyEnvelope, decision: PolicyDecision<unknown>): string => {
  return `${policy.policyId} version=${policy.profileVersion} allowed=${decision.allowed} issues=${decision.issues.length}`;
};
