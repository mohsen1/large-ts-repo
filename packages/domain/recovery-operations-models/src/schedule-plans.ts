import type { Brand } from '@shared/core';
import type { RunPlanSnapshot } from './types';
import type { ExecutionSegment, ExecutionManifest } from './execution-manifest';

export type PlanPriority = 'urgent' | 'normal' | 'deferred';
export type PlanWindowBucket = 'now' | 'next-hour' | 'next-day' | 'future';
export type StepState = 'pending' | 'running' | 'succeeded' | 'failed' | 'aborted' | 'retrying';
export type SortDirection = 'asc' | 'desc';

export interface PlanSlot {
  readonly id: Brand<string, 'PlanSlotId'>;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly startedAt: string;
  readonly durationMinutes: number;
  readonly state: StepState;
  readonly plannedBy: string;
}

export interface ScheduledStep {
  readonly segment: ExecutionSegment;
  readonly state: StepState;
  readonly startedAt?: string;
  readonly completedAt?: string;
  readonly reason?: string;
  readonly attempt: number;
}

export interface RunSchedule {
  readonly slot: PlanSlot;
  readonly steps: readonly ScheduledStep[];
  readonly riskMultiplier: number;
  readonly metadata: {
    readonly command: string;
    readonly priority: PlanPriority;
    readonly tags: readonly string[];
    readonly pathHint?: string;
  };
}

export interface CohortWindow {
  readonly bucket: PlanWindowBucket;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly schedule: readonly RunSchedule[];
  readonly createdAt: string;
}

export interface ScheduleFilters {
  readonly tenant?: Brand<string, 'TenantId'>;
  readonly state?: StepState;
  readonly priority?: PlanPriority;
}

export interface CohortAggregate {
  readonly bucket: PlanWindowBucket;
  readonly totalSlots: number;
  readonly activeSlots: number;
  readonly failedSlots: number;
}

type NormalizedFilters = { tenant?: Brand<string, 'TenantId'>; state?: StepState; priority?: PlanPriority };

const windows: readonly PlanWindowBucket[] = ['now', 'next-hour', 'next-day', 'future'];

const windowBucketByAgeMs = (ageMs: number): PlanWindowBucket => {
  if (ageMs <= 60 * 60 * 1000) return 'now';
  if (ageMs <= 12 * 60 * 60 * 1000) return 'next-hour';
  if (ageMs <= 24 * 60 * 60 * 1000) return 'next-day';
  return 'future';
};

const slotId = (tenant: string, segment: ExecutionSegment, index: number): Brand<string, 'PlanSlotId'> =>
  `${tenant}::${segment.id}::${index}` as Brand<string, 'PlanSlotId'>;

const bucketForCommand = (command: string): PlanPriority => {
  if (command.includes('verify') || command.includes('closeout')) return 'deferred';
  if (command.includes('run') || command.includes('restore')) return 'urgent';
  return 'normal';
};

const defaultStateByLane = {
  preflight: 'pending',
  'control-plane': 'pending',
  'data-plane': 'pending',
  verification: 'pending',
  rollback: 'pending',
} satisfies Record<ExecutionSegment['lane'], StepState>;

const buildStepFromSegment = (segment: ExecutionSegment): ScheduledStep => ({
  segment,
  state: defaultStateByLane[segment.lane],
  attempt: 0,
});

const compareDirection = (direction: SortDirection, left: number, right: number): number =>
  direction === 'asc' ? left - right : right - left;

export const resolveBucket = (startedAt: string): PlanWindowBucket => {
  const now = Date.now();
  const parsed = Date.parse(startedAt);
  if (!Number.isFinite(parsed)) return 'future';
  return windowBucketByAgeMs(Math.abs(now - parsed));
};

export const buildPlanSlots = (tenant: string, manifest: ExecutionManifest): RunSchedule[] =>
  manifest.segments.map((segment, index) => {
    const startsAt = new Date(Date.now() + index * 45_000).toISOString();
    const slot: PlanSlot = {
      id: slotId(tenant, segment, index),
      tenant: manifest.tenant,
      startedAt: startsAt,
      durationMinutes: Math.max(1, Math.round(segment.timeoutMs / 60_000)),
      state: defaultStateByLane[segment.lane],
      plannedBy: tenant,
    };

    return {
      slot,
      steps: [buildStepFromSegment(segment)],
      riskMultiplier: 1 + index * 0.02,
      metadata: {
        command: segment.command,
        priority: bucketForCommand(segment.command),
        tags: segment.tags,
      },
    };
  });

export const bucketByWindow = (schedules: readonly RunSchedule[]): CohortWindow[] => {
  const byBucket = new Map<PlanWindowBucket, RunSchedule[]>();
  for (const schedule of schedules) {
    const bucket = resolveBucket(schedule.slot.startedAt);
    const next = byBucket.get(bucket) ?? [];
    byBucket.set(bucket, [...next, schedule]);
  }

  return windows.map((bucket) => ({
    bucket,
    tenant: schedules[0]?.slot.tenant ?? withTenantBrand('default'),
    schedule: byBucket.get(bucket) ?? [],
    createdAt: new Date().toISOString(),
  }));
};

const withTenantBrand = (tenant: string): Brand<string, 'TenantId'> => tenant as Brand<string, 'TenantId'>;

export const aggregateCohortWindows = (buckets: readonly CohortWindow[]): CohortAggregate[] =>
  buckets.map((bucket) => ({
    bucket: bucket.bucket,
    totalSlots: bucket.schedule.length,
    activeSlots: bucket.schedule.filter((entry) => entry.steps.some((step) => step.state === 'running')).length,
    failedSlots: bucket.schedule.filter((entry) => entry.steps.some((step) => step.state === 'failed')).length,
  }));

export const mergeSchedule = (left: RunSchedule, right: RunSchedule): RunSchedule => ({
  ...left,
  ...right,
  metadata: {
    ...left.metadata,
    ...right.metadata,
    tags: [...new Set([...left.metadata.tags, ...right.metadata.tags, 'merged'])],
  },
  steps: [...left.steps, ...right.steps].slice(-6),
});

export const mergeRunSchedules = (left: readonly RunSchedule[], right: readonly RunSchedule[]): RunSchedule[] => {
  const map = new Map<string, RunSchedule>();
  for (const entry of left) {
    map.set(entry.slot.id, entry);
  }
  for (const entry of right) {
    const existing = map.get(entry.slot.id);
    map.set(entry.slot.id, existing ? mergeSchedule(existing, entry) : entry);
  }
  return Array.from(map.values());
};

export const matchByPlan = (plan: RunPlanSnapshot, schedules: readonly RunSchedule[]): RunSchedule[] =>
  schedules.filter((entry) => entry.metadata.command === String(plan.id));

export const orderByUrgency = (schedules: readonly RunSchedule[], direction: SortDirection = 'asc'): RunSchedule[] =>
  [...schedules].sort((left, right) =>
    compareDirection(direction, Number(right.riskMultiplier), Number(left.riskMultiplier)),
  );

export const assignState = (entry: RunSchedule, state: StepState, reason?: string): RunSchedule => ({
  ...entry,
  steps: entry.steps.map((step) => ({
    ...step,
    state,
    reason,
  })),
});

export const isReadyToRun = (entry: RunSchedule): boolean =>
  entry.steps.some((step) => step.state === 'pending') && !entry.steps.some((step) => step.state === 'failed');

export const summarizeFilters = (filters: ScheduleFilters): string => {
  const normalized: NormalizedFilters = {
    tenant: filters.tenant,
    state: filters.state,
    priority: filters.priority,
  };
  return JSON.stringify({
    tenant: normalized.tenant ?? 'all',
    state: normalized.state ?? 'any',
    priority: normalized.priority ?? 'normal',
  });
};

export const normalizeFilters = (filters: ScheduleFilters): NormalizedFilters & { hasFilters: boolean } => ({
  tenant: filters.tenant,
  state: filters.state,
  priority: filters.priority,
  hasFilters: Boolean(filters.tenant || filters.state || filters.priority),
});

export const selectByFilters = (
  schedules: readonly RunSchedule[],
  filters: ScheduleFilters,
): RunSchedule[] =>
  schedules.filter((entry) => {
    if (filters.tenant && entry.slot.tenant !== filters.tenant) {
      return false;
    }
    if (filters.state && !entry.steps.some((step) => step.state === filters.state)) {
      return false;
    }
    if (filters.priority && entry.metadata.priority !== filters.priority) {
      return false;
    }
    return true;
  });
