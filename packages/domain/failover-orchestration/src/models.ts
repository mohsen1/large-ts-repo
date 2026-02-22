import { Brand, DeepReadonly, Merge, NonEmptyArray, UnionToIntersection } from '@shared/type-level';

export type RegionCode = Brand<string, 'RegionCode'>;
export type PlanId = Brand<string, 'FailoverPlanId'>;
export type StageId = Brand<string, 'FailoverStageId'>;

export type RtoStageState =
  | 'scheduled'
  | 'waiting-approval'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed';

export interface RegionWindow {
  region: RegionCode;
  primary: boolean;
  healthy: boolean;
  capacityPercent: number;
  maxCapacityPercent: number;
}

export interface StageWindow {
  startsAt: string;
  durationMinutes: number;
  expectedCutoverMinutes?: number;
  regions: Record<string, RegionWindow>;
}

export interface RtoPlaybook {
  region: RegionCode;
  objective: string;
  runbookUrl?: string;
  requiredApprovals: number;
}

export interface FailoverPlan {
  id: PlanId;
  tenantId: Brand<string, 'TenantId'>;
  productFamily: string;
  environment: 'prod' | 'staging' | 'sandbox';
  ownerTeam: string;
  planName: string;
  windows: StageWindow[];
  playbooks: RtoPlaybook[];
  slaMinutes: number;
  targetRtoMinutes: number;
  state: RtoPlanState;
  createdAt: string;
  updatedAt: string;
}

export interface FailoverEventMeta {
  requestId: Brand<string, 'RequestId'>;
  sourceRegion: RegionCode;
  destinationRegion?: RegionCode;
  stage: StageId;
  severity: 'low' | 'medium' | 'high' | 'critical';
  operator?: string;
}

export type RtoPlanState = 'draft' | 'validating' | 'ready' | 'running' | 'rolled-back' | 'retired';

export type MetricName = Brand<string, 'MetricName'>;

export interface StageConstraint {
  canaryPercent: number;
  maxRetries: number;
  rollbackOnErrorRate: number;
}

export interface RunContext {
  operator: string;
  approvedBy: string[];
  startedAt: string;
  notes: string[];
}

export interface RunResult {
  planId: PlanId;
  stage: StageId;
  completedAt: string;
  success: boolean;
  details: string;
  metrics: Record<MetricName, number>;
}

export interface StageGraph {
  id: StageId;
  stageName: string;
  prerequisites: StageId[];
  next?: StageId;
}

export interface PlanSnapshot {
  plan: FailoverPlan;
  graph: StageGraph[];
  constraints: StageConstraint;
  metrics: {
    projectedRtoMinutes: number;
    projectedRpoMinutes: number;
    complianceScore: number;
  };
  createdAt: string;
}

export type PlanDraft = Omit<FailoverPlan, 'id' | 'state' | 'createdAt' | 'updatedAt'>;

export type ReadonlyPlan = DeepReadonly<FailoverPlan>;
export type StageWindowSlice = Pick<StageWindow, 'startsAt' | 'durationMinutes' | 'regions'>;

export type ConstraintInput = Merge<Pick<PlanDraft, 'slaMinutes' | 'targetRtoMinutes'>, { windowCount: number }>;

export type PlanGraph = NonEmptyArray<StageGraph>;

export const DEFAULT_ROLLBACK_METRIC_THRESHOLD: Readonly<RunResult> = {
  planId: '' as PlanId,
  stage: '' as StageId,
  completedAt: new Date(0).toISOString(),
  success: false,
  details: 'default',
  metrics: {
    'error-rate': 0,
    'lag-ms': 0,
  },
};

export const constraintUnion = (constraints: readonly StageConstraint[]): UnionToIntersection<StageConstraint> => {
  const result: StageConstraint = constraints.reduce((acc, constraint) => ({ ...acc, ...constraint }), {
    canaryPercent: 0,
    maxRetries: 0,
    rollbackOnErrorRate: 0,
  });
  return result as UnionToIntersection<StageConstraint>;
};

export const isReady = (state: RtoPlanState): boolean => state === 'ready';

export const toStageSlice = (window: StageWindow): StageWindowSlice => ({
  startsAt: window.startsAt,
  durationMinutes: window.durationMinutes,
  regions: window.regions,
});
