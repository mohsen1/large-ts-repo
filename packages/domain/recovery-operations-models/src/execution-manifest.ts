import { withBrand } from '@shared/core';
import type { Brand } from '@shared/core';
import type {
  RunPlanSnapshot,
  RecoveryConstraintBudget,
  RecoverySignal,
  RecoveryConstraintBudget as DomainConstraintBudget,
} from './types';
import { estimateBudgetFromSignals } from './strategy';

type IsoDateString = Brand<string, 'IsoDateString'>;

export type ExecutionLane = 'preflight' | 'control-plane' | 'data-plane' | 'verification' | 'rollback';
export type ExecutionWindow = 'minutes' | 'hours' | 'days';
export type ExecutionPriority = 'critical' | 'high' | 'normal' | 'low';

export interface ExecutionSegment {
  readonly id: Brand<string, 'ExecutionSegmentId'>;
  readonly lane: ExecutionLane;
  readonly order: number;
  readonly command: string;
  readonly retryLimit: number;
  readonly timeoutMs: number;
  readonly requiredApprovals: number;
  readonly dependsOn: readonly Brand<string, 'ExecutionSegmentId'>[];
  readonly tags: readonly string[];
}

export interface ExecutionManifest {
  readonly tenant: Brand<string, 'TenantId'>;
  readonly planId: RunPlanSnapshot['id'];
  readonly sessionId: Brand<string, 'RunSessionId'>;
  readonly lane: ExecutionLane;
  readonly priority: ExecutionPriority;
  readonly startedAt: IsoDateString;
  readonly expiresAt: IsoDateString;
  readonly window: ExecutionWindow;
  readonly budget: RecoveryConstraintBudget;
  readonly segments: readonly ExecutionSegment[];
}

export interface ValidationIssue {
  readonly code: 'segment-order' | 'segment-timeout' | 'circular-dependency' | 'excessive-retries';
  readonly message: string;
}

export interface ManifestValidationResult {
  readonly ok: boolean;
  readonly issues: readonly ValidationIssue[];
}

export interface ExecutionManifestEnvelope<TPayload extends ExecutionManifest> {
  readonly manifestId: Brand<string, 'ExecutionManifestId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly payload: TPayload;
  readonly createdAt: IsoDateString;
}

const segmentSchema = {
  id: (value: string) => withBrand(value, 'ExecutionSegmentId'),
};

const manifestSchema = {
  tenant: (value: string) => withBrand(value, 'TenantId'),
  planId: (value: string) => withBrand(value, 'RunPlanId'),
  sessionId: (value: string) => withBrand(value, 'RunSessionId'),
};

const toIsoDate = (value: string): IsoDateString => withBrand(value, 'IsoDateString');

const isDateInOrder = (left: string, right: string): boolean => {
  const leftTs = Date.parse(left);
  const rightTs = Date.parse(right);
  return Number.isFinite(leftTs) && Number.isFinite(rightTs) && leftTs <= rightTs;
};

export const normalizeWindow = (segmentCount: number, windowHint: number): ExecutionWindow =>
  windowHint <= 60 ? 'minutes' : segmentCount > 8 ? 'hours' : 'days';

export const buildDefaultSegments = (planId: string): ExecutionSegment[] => {
  const commands = [
    'collect-snapshot',
    'evaluate-policy',
    'validate-preconditions',
    'run-drill-sim',
    'run-remediation',
    'verify-restoration',
    'closeout-notes',
  ];

  return commands.map((command, index) => ({
    id: `${planId}-${command}` as Brand<string, 'ExecutionSegmentId'>,
    lane: index % 2 === 0 ? 'control-plane' : 'verification',
    order: index,
    command,
    retryLimit: Math.min(3, 1 + index),
    timeoutMs: (index + 1) * 60_000,
    requiredApprovals: index === 0 ? 1 : 0,
    dependsOn: index === 0 ? [] : [`${planId}-${commands[index - 1]}` as Brand<string, 'ExecutionSegmentId'>],
    tags: ['automated', `phase:${Math.floor(index / 2)}`],
  }));
};

const validateDependency = (
  segment: ExecutionSegment,
  seen: Set<string>,
): boolean => {
  if (segment.dependsOn.length === 0) return true;
  return segment.dependsOn.every((dep) => seen.has(dep));
};

const collectCycleIssues = (
  segments: readonly ExecutionSegment[],
): readonly ValidationIssue[] => {
  const seen = new Set<string>();
  const cycles: ValidationIssue[] = [];

  for (const segment of segments) {
    const key = String(segment.id);
    if (!validateDependency(segment, seen)) {
      cycles.push({
        code: 'circular-dependency',
        message: `Segment ${key} has unresolved dependency chain`,
      });
    }

    seen.add(key);
  }

  for (const segment of segments) {
    if (segment.order < 0 || segment.retryLimit < 0 || segment.timeoutMs <= 0) {
      cycles.push({
        code: 'segment-timeout',
        message: `Segment ${String(segment.id)} has invalid timing`,
      });
    }
  }

  return cycles;
};

export const validateManifest = (input: unknown): ManifestValidationResult => {
  const parsed = manifestSchema as unknown as ExecutionManifest;
  const segmentOrderIssues = parsed.segments.some((segment, index) => segment.order !== index)
    ? [{ code: 'segment-order' as const, message: 'Segment execution order is not contiguous' }]
    : [];

  const timeoutIssues: ValidationIssue[] = parsed.segments
    .filter((segment) => segment.timeoutMs > 10 * 60_000)
    .map((segment) => ({
      code: 'segment-timeout',
      message: `Segment ${String(segment.id)} timeout above ten minutes`,
    }));

  const circularIssues: readonly ValidationIssue[] = collectCycleIssues(parsed.segments);
  const retryIssues: readonly ValidationIssue[] = parsed.segments
    .filter((segment) => segment.retryLimit > 8)
    .map((segment) => ({
      code: 'excessive-retries',
      message: `Segment ${String(segment.id)} allows too many retries`,
    }));

  const windowIssues: ValidationIssue[] = [];
  if (!isDateInOrder(String(parsed.startedAt), String(parsed.expiresAt))) {
    windowIssues.push({ code: 'segment-timeout', message: 'Manifest expiration is before start' });
  }

  const issues = [...segmentOrderIssues, ...timeoutIssues, ...circularIssues, ...retryIssues, ...windowIssues];

  return {
    ok: issues.length === 0,
    issues,
  };
};

export const buildExecutionManifest = (
  tenant: string,
  plan: RunPlanSnapshot,
  signals: readonly RecoverySignal[],
): ExecutionManifest => {
  const budget = estimateBudgetFromSignals(
    plan.fingerprint,
    signals,
  ) as DomainConstraintBudget & RecoveryConstraintBudget;
  const segments = buildDefaultSegments(String(plan.id));
  const startedAt = new Date();
  const timeoutMinutes = Math.max(15, budget.timeoutMinutes);
  const expiresAt = new Date(startedAt.getTime() + timeoutMinutes * 60_000);
  const priority: ExecutionPriority = budget.operatorApprovalRequired || timeoutMinutes > 180 ? 'critical' : 'high';

  return {
    tenant: withBrand(tenant, 'TenantId'),
    planId: plan.id,
    sessionId: withBrand(`${tenant}-${plan.id}-${Date.now()}`, 'RunSessionId'),
    lane: plan.program.steps.length > 6 ? 'control-plane' : 'verification',
    priority,
    startedAt: toIsoDate(startedAt.toISOString()),
    expiresAt: toIsoDate(expiresAt.toISOString()),
    window: normalizeWindow(segments.length, timeoutMinutes),
    budget,
    segments,
  };
};

export const toEnvelope = <T extends ExecutionManifest>(manifest: T, tenant: string): ExecutionManifestEnvelope<T> => ({
  manifestId: withBrand(`${tenant}-${String(manifest.planId)}-${Date.now()}`, 'ExecutionManifestId'),
  tenant: withBrand(tenant, 'TenantId'),
  payload: manifest,
  createdAt: toIsoDate(new Date().toISOString()),
});

export const segmentSummary = (manifest: ExecutionManifest): string => {
  const duration = manifest.segments.reduce((total, segment) => total + segment.timeoutMs, 0);
  return `${manifest.lane}:${manifest.priority}:${manifest.segments.length}:${duration}`;
};
