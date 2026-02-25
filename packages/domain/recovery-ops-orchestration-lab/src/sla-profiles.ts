import type { JsonValue } from '@shared/type-level';
import { partitionBy } from '@shared/typed-orchestration-core';
import type { LabPlan, OrchestrationLab } from './types';

export type SlaId = `sla:${string}`;
export type SlaTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type SlaShape = 'tight' | 'default' | 'relaxed' | 'adaptive';
export type TimelinePolicy = 'continuous' | 'batch' | 'hybrid';
export type WindowShape = 'circular' | 'sliding' | 'fixed';

export type WindowWindow = `${SlaTier}:${WindowShape}`;
export type ConstraintKey = `${TimelinePolicy}-${SlaShape}`;

export type WindowKey = `${SlaId}:${SlaTier}:${string}`;
export type ConstraintSignalKey<T extends SlaTier> = `${T}:${SlaShape}`;
export type WindowSignalKey<T extends WindowShape> = `window:${T}`;

export interface SLAConstraint {
  readonly id: string;
  readonly metric: string;
  readonly threshold: number;
  readonly tier: SlaTier;
  readonly enabled: boolean;
  readonly shape: SlaShape;
  readonly notes?: string;
}

export interface SLAProfile {
  readonly id: SlaId;
  readonly tenantId: string;
  readonly constraints: readonly SLAConstraint[];
  readonly policy: TimelinePolicy;
  readonly metadata: Record<string, JsonValue>;
  readonly revision: number;
  readonly createdAt: string;
}

export interface SLAWindow {
  readonly id: WindowKey;
  readonly policy: SlaTier;
  readonly from: string;
  readonly to: string;
  readonly maxWindowMinutes: number;
  readonly minWindowMinutes: number;
  readonly shape: WindowShape;
}

export interface SLAValidation {
  readonly profileId: SlaId;
  readonly passed: boolean;
  readonly violations: readonly string[];
  readonly score: number;
  readonly checkedAt: string;
}

export interface ProfileWindowDigest {
  readonly id: WindowKey;
  readonly score: number;
  readonly labels: readonly string[];
  readonly budgetMinutes: number;
}

export type ConstraintTuple<TInput extends readonly SLAConstraint[]> = TInput extends readonly [
  infer Left,
  ...infer Right,
]
  ? readonly [Left & SLAConstraint, ...ConstraintTuple<Right extends readonly SLAConstraint[] ? Right : readonly []>]
  : readonly [];

export type ConstraintByTier<TConstraints extends readonly SLAConstraint[]> = {
  bronze: readonly Extract<TConstraints[number], { readonly tier: 'bronze' }>[];
  silver: readonly Extract<TConstraints[number], { readonly tier: 'silver' }>[];
  gold: readonly Extract<TConstraints[number], { readonly tier: 'gold' }>[];
  platinum: readonly Extract<TConstraints[number], { readonly tier: 'platinum' }>[];
};

export type WindowTuple<TWindows extends readonly SLAWindow[]> = TWindows extends readonly [
  infer Left,
  ...infer Right,
]
  ? readonly [Left & SLAWindow, ...WindowTuple<Right extends readonly SLAWindow[] ? Right : readonly []>]
  : readonly [];

const nowIso = (): string => new Date().toISOString();

const normalizeTier = (value: string): SlaTier => {
  switch (value) {
    case 'gold':
      return 'gold';
    case 'platinum':
      return 'platinum';
    case 'silver':
      return 'silver';
    default:
      return 'bronze';
  }
};

const normalizeShape = (value: string): SlaShape => {
  switch (value) {
    case 'tight':
      return 'tight';
    case 'relaxed':
      return 'relaxed';
    case 'adaptive':
      return 'adaptive';
    default:
      return 'default';
  }
};

const normalizeWindowShape = (value: string): WindowShape => {
  switch (value) {
    case 'sliding':
      return 'sliding';
    case 'circular':
      return 'circular';
    default:
      return 'fixed';
  }
};

const asWindowKey = (tenant: string, tier: SlaTier, window: number): WindowKey =>
  `sla:${tenant}:${tier}:${window}` as WindowKey;

const asSlaId = (value: string): SlaId => `sla:${value}` as SlaId;
const asConstraintKey = (tier: SlaTier, shape: SlaShape): ConstraintSignalKey<typeof tier> => `${tier}:${shape}`;

const toWindowShape = (value: number): WindowShape =>
  normalizeWindowShape(value % 3 === 0 ? 'sliding' : value % 2 === 0 ? 'circular' : 'fixed');

export const withWindow = (
  from: Date,
  to: Date,
  policy: SlaTier,
  shape?: WindowShape,
): SLAWindow => {
  const diffMinutes = Math.max(1, Math.floor((to.getTime() - from.getTime()) / 60000));
  const safeFrom = new Date(Math.min(from.getTime(), to.getTime()));

  return {
    id: asWindowKey(`sla:${safeFrom.toISOString()}`, policy, diffMinutes),
    policy,
    from: safeFrom.toISOString(),
    to: new Date(Math.max(safeFrom.getTime(), to.getTime())).toISOString(),
    maxWindowMinutes: diffMinutes,
    minWindowMinutes: Math.max(1, Math.floor(diffMinutes / 2)),
    shape: shape ?? toWindowShape(diffMinutes),
  };
};

export const normalizeProfile = (input: {
  readonly tenantId: string;
  readonly constraints: readonly SLAConstraint[];
  readonly policy: TimelinePolicy;
  readonly metadata?: Record<string, JsonValue>;
}) => {
  const normalized = {
    id: asSlaId(input.tenantId),
    tenantId: input.tenantId,
    constraints: input.constraints.map((constraint, index) => ({
      ...constraint,
      id: constraint.id || `constraint:${input.tenantId}:${index}`,
      tier: normalizeTier(constraint.tier),
      shape: normalizeShape(constraint.shape),
      enabled: Boolean(constraint.enabled),
      threshold: Math.max(0, Math.floor(constraint.threshold)),
      notes: constraint.notes,
    })),
    policy: input.policy,
    metadata: {
      ...input.metadata,
      source: 'normalizeProfile',
    },
    revision: 1,
  } satisfies Omit<SLAProfile, 'createdAt'> & { readonly constraints: readonly SLAConstraint[] };

  return {
    ...normalized,
    createdAt: nowIso(),
  } satisfies SLAProfile;
};

const collectByTier = <TConstraints extends readonly SLAConstraint[]>(constraints: TConstraints): ConstraintByTier<TConstraints> => {
  const grouped = partitionBy(constraints, (entry) => entry.tier);

  const asTier = <TLocalTier extends SlaTier>(tier: TLocalTier) =>
    (grouped.get(tier) ?? []) as unknown as readonly Extract<TConstraints[number], { readonly tier: TLocalTier }>[];

  return {
    bronze: asTier('bronze'),
    silver: asTier('silver'),
    gold: asTier('gold'),
    platinum: asTier('platinum'),
  } satisfies ConstraintByTier<TConstraints>;
};

export const byTier = <TConstraints extends readonly SLAConstraint[]>(constraints: TConstraints): ConstraintByTier<TConstraints> => {
  const grouped = collectByTier(constraints);
  return {
    ...grouped,
    bronze: [...grouped.bronze],
    silver: [...grouped.silver],
    gold: [...grouped.gold],
    platinum: [...grouped.platinum],
  };
};

export const asConstraintMap = <TConstraints extends readonly SLAConstraint[]>(
  constraints: TConstraints,
): ReadonlyMap<ConstraintSignalKey<SlaTier>, ConstraintTuple<TConstraints>> => {
  const grouped = partitionBy(constraints, (entry) => asConstraintKey(entry.tier, entry.shape));

  const entries = [...grouped.entries()].map(([key, values]) => [key, values as unknown as ConstraintTuple<TConstraints>] as const);
  return new Map(entries) as ReadonlyMap<ConstraintSignalKey<SlaTier>, ConstraintTuple<TConstraints>>;
};

export const computeProfileDigest = (profile: SLAProfile): ProfileWindowDigest => {
  const active = profile.constraints.filter((entry) => entry.enabled);
  const labels = active.map((entry) => `${entry.metric}:${entry.shape}`);
  const score = active.length
    ? Number((active.reduce((acc, entry) => acc + entry.threshold, 0) / active.length).toFixed(3))
    : 0;

  const budget = active.reduce((acc, constraint) => acc + constraint.threshold, 0);

  return {
    id: asWindowKey(profile.id, profile.constraints[0]?.tier ?? 'bronze', active.length),
    score,
    labels,
    budgetMinutes: budget,
  } satisfies ProfileWindowDigest;
};

export const profileWindows = (profile: SLAProfile, windows: readonly SLAWindow[]): WindowTuple<typeof windows> => {
  const ordered = [...windows].toSorted((left, right) => {
    const leftTime = new Date(left.from).getTime();
    const rightTime = new Date(right.from).getTime();
    return leftTime - rightTime;
  });

  return ordered as unknown as WindowTuple<typeof windows>;
};

export const constraintsForPolicy = <TConstraints extends readonly SLAConstraint[]>(
  constraints: TConstraints,
  policy: TimelinePolicy,
): ReadonlyArray<{ readonly constraint: TConstraints[number]; readonly key: ConstraintKey }> =>
  constraints.map((constraint) => ({
    constraint,
    key: `${policy}-${constraint.shape}` as ConstraintKey,
  }));

export const evaluateWindowHealth = (profile: SLAProfile, policyId: SlaId, windows: readonly SLAWindow[]): SLAValidation => {
  const matched = windows.filter((entry) => entry.id.startsWith(policyId));
  const violations: string[] = [];

  for (const [index, window] of matched.entries()) {
    if (!Number.isFinite(window.maxWindowMinutes) || window.maxWindowMinutes <= window.minWindowMinutes) {
      violations.push(`window:${index}:invalid-range`);
    }
    if (window.shape === 'circular' && window.maxWindowMinutes < 15) {
      violations.push(`window:${index}:circular-too-short`);
    }
  }

  const thresholdPenalty = profile.constraints.reduce(
    (acc, constraint) => acc + (constraint.enabled ? constraint.threshold : 0),
    0,
  );

  const score = Math.max(0, Number((1 - violations.length * 0.2 - thresholdPenalty / 100).toFixed(3)));

  return {
    profileId: profile.id,
    passed: violations.length === 0,
    violations,
    score,
    checkedAt: nowIso(),
  };
};

export const collectSignalsForProfile = <TPlans extends readonly LabPlan[]>(plans: TPlans): readonly string[] => {
  const signalIds = plans.flatMap((plan) => plan.steps.map((step, index) => `${plan.id}:${step.id}:${index}`));
  return [...new Set(signalIds)] as readonly string[];
};

export const collectConstraintSignatures = <TConstraints extends readonly SLAConstraint[]>(
  constraints: TConstraints,
): readonly string[] => {
  const signatures = constraints.flatMap((entry, index) =>
    index === 0 ? [] : [`${constraints[index - 1]!.id}::${entry.threshold}`],
  );
  return signatures.toSorted();
};

export const profileConstraintStats = (profile: SLAProfile): ReadonlyMap<'critical' | 'warning' | 'ok', number> => {
  const map = new Map<'critical' | 'warning' | 'ok', number>([
    ['critical', 0],
    ['warning', 0],
    ['ok', 0],
  ]);

  for (const constraint of profile.constraints) {
    if (!constraint.enabled) {
      map.set('warning', (map.get('warning') ?? 0) + 1);
      continue;
    }
    if (constraint.threshold >= 90) {
      map.set('critical', (map.get('critical') ?? 0) + 1);
      continue;
    }
    map.set('ok', (map.get('ok') ?? 0) + 1);
  }

  return map;
};

export const profileSummary = (profile: SLAProfile): string => {
  const enabled = profile.constraints.filter((constraint) => constraint.enabled).length;
  return `${profile.id}::${profile.policy}::${enabled}/${profile.constraints.length}::rev:${profile.revision}`;
};

export const mergeProfiles = (left: SLAProfile, right: SLAProfile): SLAProfile => {
  const constraints = [...left.constraints, ...right.constraints] as readonly SLAConstraint[];
  const merged = normalizeProfile({
    tenantId: left.tenantId,
    constraints,
    policy: right.policy,
    metadata: {
      ...left.metadata,
      ...right.metadata,
    },
  });

  return {
    ...merged,
    revision: Math.max(left.revision, right.revision) + 1,
    createdAt: nowIso(),
  } satisfies SLAProfile;
};

const policyPreview = (input: Pick<OrchestrationLab, 'id' | 'signals'>): string =>
  `${input.id}|signals=${input.signals.length}`;

export const collectTenantPolicyViews = (lab: OrchestrationLab, windowCount = 3): readonly string[] => {
  const views = lab.plans
    .slice(0, windowCount)
    .map((plan) => `${plan.id}:${plan.title}:${plan.score}`)
    .toSorted();
  return [...views, policyPreview(lab)] as const;
};
