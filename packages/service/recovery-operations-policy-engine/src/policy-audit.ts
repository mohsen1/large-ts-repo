import type { RecoveryOperationsEnvelope, IncidentFingerprint, RecoverySignal } from '@domain/recovery-operations-models';
import type { RecoveryReadinessPlan } from '@domain/recovery-readiness';
import type { PolicyDecision } from './policy-orchestrator';
import { withBrand } from '@shared/core';

export interface PolicyAuditEntry {
  readonly at: string;
  readonly tenant: string;
  readonly runId: string;
  readonly decision: 'allow' | 'block';
  readonly reason: string;
  readonly reasons: readonly string[];
  readonly signalCount: number;
}

export interface PolicyAuditEnvelope {
  readonly eventId: string;
  readonly tenant: string;
  readonly payload: {
    readonly runId: string;
    readonly decision: 'allow' | 'block';
    readonly reasons: readonly string[];
  };
  readonly createdAt: string;
}

export interface PolicyAuditPolicyContext {
  readonly tenant: string;
  readonly runId: string;
  readonly decision: PolicyDecision;
}

const maxReasons = 8;

const sanitize = (input: string): string =>
  input
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, '-')
    .slice(0, 48);

const reasonLines = (decision: PolicyDecision): readonly string[] =>
  [decision.reason, decision.outcome.blocked ? 'blocked' : 'allowed']
    .filter(Boolean)
    .slice(0, maxReasons)
    .map(sanitize);

export const createAuditEntry = (
  tenant: string,
  runId: string,
  decision: PolicyDecision,
  signals: readonly RecoverySignal[],
): PolicyAuditEntry => ({
  at: new Date().toISOString(),
  tenant,
  runId,
  decision: decision.decision,
  reason: sanitize(decision.reason),
  reasons: reasonLines(decision),
  signalCount: signals.length,
});

export const toAuditEnvelope = (entry: PolicyAuditEntry): PolicyAuditEnvelope => ({
  eventId: `${entry.runId}-${Date.now()}`,
  tenant: withBrand(entry.tenant, 'TenantId'),
  payload: {
    runId: entry.runId,
    decision: entry.decision,
    reasons: entry.reasons,
  },
  createdAt: entry.at,
});

export const toRecoveryOperationsEnvelope = (entry: PolicyAuditEntry): RecoveryOperationsEnvelope<PolicyAuditEntry> => ({
  eventId: `${entry.runId}-${Date.now()}`,
  tenant: withBrand(entry.tenant, 'TenantId'),
  payload: entry,
  createdAt: entry.at,
});

export const summarizeAudit = (entries: readonly PolicyAuditEntry[]): string[] =>
  entries.map((entry) => `${entry.at}|${entry.runId}|${entry.decision}|${entry.reason}`);

export const buildTenantDecisionDigest = (
  tenant: string,
  runId: string,
  decision: PolicyDecision,
  plan: RecoveryReadinessPlan,
): string => {
  const signalText = plan.targets.length ? plan.targets.join('|') : 'none';
  const decisionText = `${tenant}:${runId}:${decision.decision}:${decision.reason}`;
  return `${decisionText}:${signalText}`.slice(0, 180);
};

export const normalizeFingerprint = (fingerprint: IncidentFingerprint): string =>
  `${fingerprint.tenant}:${fingerprint.region}:${fingerprint.serviceFamily}:${fingerprint.impactClass}`;
