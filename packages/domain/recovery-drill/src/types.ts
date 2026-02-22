import type { Brand } from '@shared/core';
import type { Optionalize } from '@shared/type-level';
import type { DeepReadonly } from '@shared/type-level';

export type RecoveryDrillTemplateId = Brand<string, 'RecoveryDrillTemplateId'>;
export type RecoveryDrillRunId = Brand<string, 'RecoveryDrillRunId'>;
export type RecoveryDrillTenantId = Brand<string, 'TenantId'>;

export type DrillMode = 'tabletop' | 'game-day' | 'automated-chaos' | 'customer-sim';
export type DrillPriority = 'bronze' | 'silver' | 'gold' | 'platinum' | 'critical';
export type DrillImpact = 'low' | 'medium' | 'high' | 'critical';
export type DrillStatus =
  | 'planned'
  | 'queued'
  | 'running'
  | 'paused'
  | 'succeeded'
  | 'degraded'
  | 'failed'
  | 'cancelled';

export interface DrillWindow {
  startAt: string;
  endAt: string;
  timezone: string;
}

export interface DrillConstraint {
  code: string;
  description: string;
  targetService: string;
  thresholdPct: number;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'range';
}

export interface DrillStep {
  id: string;
  title: string;
  command: string;
  targetServices: readonly string[];
  expectedSeconds: number;
  rollback?: string;
  requiredApprovals: number;
  constraints: readonly DrillConstraint[];
}

export interface DrillScenario {
  id: string;
  title: string;
  summary: string;
  objective: string;
  impact: DrillImpact;
  recoveryImpactScore: number;
  steps: readonly DrillStep[];
  prerequisites: readonly string[];
  owners: readonly string[];
}

export interface DrillTemplate {
  id: RecoveryDrillTemplateId;
  tenantId: RecoveryDrillTenantId;
  service: Brand<string, 'ServiceId'>;
  title: string;
  mode: DrillMode;
  priority: DrillPriority;
  window: DrillWindow;
  scenarios: readonly DrillScenario[];
  defaultApprovals: number;
  createdBy: Brand<string, 'IdentityId'>;
  tags: Readonly<Record<string, string>>;
  createdAt: string;
  updatedAt: string;
}

export interface DrillRunContext {
  runId: RecoveryDrillRunId;
  templateId: RecoveryDrillTemplateId;
  runAt: string;
  initiatedBy: Brand<string, 'IdentityId'>;
  mode: DrillMode;
  approvals: number;
}

export interface DrillCheckpoint {
  at: string;
  stepId: string;
  status: 'started' | 'completed' | 'warned' | 'failed';
  output?: string;
  durationMs: number;
}

export interface DrillPolicyGate {
  code: string;
  passed: boolean;
  details: string;
}

export interface RecoveryDrillRun {
  id: RecoveryDrillRunId;
  template: DrillTemplate;
  context: DrillRunContext;
  status: DrillStatus;
  scenarioOrder: readonly string[];
  executedSteps: readonly string[];
  checkpoints: readonly DrillCheckpoint[];
  failurePoint?: string;
  createdAt: string;
  updatedAt: string;
  window: DrillWindow;
}

export interface DrillExecutionProfile {
  runId: RecoveryDrillRunId;
  elapsedMs: number;
  estimatedMs: number;
  queueDepth: number;
  successRate: number;
}

export interface DrillPlanEnvelope<T extends string = string> {
  source: T;
  sequence: readonly string[];
  issuedAt: string;
  checks: readonly DrillPolicyGate[];
}

export interface DrillQuery {
  tenant?: RecoveryDrillTenantId;
  status?: readonly DrillStatus[];
  mode?: DrillMode;
  priority?: DrillPriority;
}

export type DrillCandidate = {
  templateId: RecoveryDrillTemplateId;
  score: number;
  reasons: readonly string[];
};

export interface DrillTemplateProjection {
  id: RecoveryDrillTemplateId;
  tenantId: RecoveryDrillTenantId;
  priority: DrillPriority;
  scenarioCount: number;
  window: DrillWindow;
}

export interface DrillTemplatePlan {
  template: DrillTemplate;
  context: DrillRunContext;
  scenarioOrder: readonly string[];
  envelope: DrillPlanEnvelope<'recovery-drill'>;
}

export interface DrillPageArgs extends Optionalize<Pick<DrillTemplate, 'id'>, 'id'> {}

export type DrillEnvelope = DeepReadonly<DrillTemplatePlan>;
