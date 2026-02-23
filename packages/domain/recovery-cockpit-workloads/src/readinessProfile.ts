import { UtcIsoTimestamp, RecoveryPlan, toTimestamp, RecoveryAction } from '@domain/recovery-cockpit-models';
import { PlanId } from '@domain/recovery-cockpit-models';
import { WorkloadTopology } from './topology';

export type ReadinessRiskBand = 'stable' | 'degraded' | 'fragile' | 'critical';

export type ReadinessProfileWindow = {
  readonly at: UtcIsoTimestamp;
  readonly score: number;
  readonly band: ReadinessRiskBand;
  readonly trigger: string;
};

export type ServiceReadinessProfile = {
  readonly planId: PlanId;
  readonly namespace: string;
  readonly windows: readonly ReadinessProfileWindow[];
  readonly mean: number;
  readonly trend: number;
  readonly confidence: number;
};

const bandOf = (value: number): ReadinessRiskBand => {
  if (value >= 85) return 'stable';
  if (value >= 65) return 'degraded';
  if (value >= 40) return 'fragile';
  return 'critical';
};

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

const actionContribution = (action: RecoveryAction, index: number): number => {
  const base = 100 - action.expectedDurationMinutes - action.dependencies.length * 4;
  const indexPenalty = index * 1.25;
  return clamp(base - indexPenalty, 0, 100);
};

export const buildReadinessProfile = (plan: RecoveryPlan, seed = Date.now()): ServiceReadinessProfile => {
  const sorted = [...plan.actions].sort((left, right) => left.expectedDurationMinutes - right.expectedDurationMinutes);
  const windows = sorted.map((action, index) => {
    const at = toTimestamp(new Date(seed + index * 3 * 60 * 1000));
    const value = actionContribution(action, index);
    const trigger = action.dependencies.length > 0 ? 'dependency-order' : action.command.includes('drain') ? 'traffic-cut' : 'base';
    return {
      at,
      score: Number(value.toFixed(2)),
      band: bandOf(value),
      trigger,
    };
  });

  const mean = Number((windows.reduce((sum, window) => sum + window.score, 0) / Math.max(1, windows.length)).toFixed(2));
  const trend = Number((windows.at(-1)?.score ?? 0) - (windows[0]?.score ?? 0));
  const max = windows.reduce((maxScore, window) => Math.max(maxScore, window.score), 0);
  const min = windows.reduce((minScore, window) => Math.min(minScore, window.score), 100);
  const confidence = clamp(max - min, 0, 100);
  return {
    planId: plan.planId,
    namespace: plan.labels.short,
    windows,
    mean,
    trend,
    confidence,
  };
};

export const mergeProfiles = (profiles: readonly ServiceReadinessProfile[]): ServiceReadinessProfile[] => {
  const byNamespace = new Map<string, ServiceReadinessProfile[]>();
  for (const profile of profiles) {
    const existing = byNamespace.get(profile.namespace) ?? [];
    existing.push(profile);
    byNamespace.set(profile.namespace, existing);
  }

  return Array.from(byNamespace.entries()).map(([namespace, entries]) => {
    const windowsByOffset = new Map<number, number[]>();
    for (const profile of entries) {
      for (const [index, window] of profile.windows.entries()) {
        const bucket = windowsByOffset.get(index) ?? [];
        bucket.push(window.score);
        windowsByOffset.set(index, bucket);
      }
    }

    const mergedWindows = Array.from(windowsByOffset.entries())
      .sort(([left], [right]) => left - right)
      .map(([index, scores]) => {
        const atBase = entries[0]?.windows[index]?.at ?? toTimestamp(new Date());
        const value = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        return {
          at: atBase,
          score: Number(value.toFixed(2)),
          band: bandOf(value),
          trigger: 'namespace-merge',
        };
      });

    const average = mergedWindows.reduce((sum, item) => sum + item.score, 0) / Math.max(1, mergedWindows.length);
  return {
    planId: entries[0]?.planId ?? ('merged' as PlanId),
      namespace,
      windows: mergedWindows,
      mean: Number(average.toFixed(2)),
      trend: Number((mergedWindows.at(-1)?.score ?? 0) - (mergedWindows[0]?.score ?? 0)),
      confidence: Number((100 - ((mergedWindows.reduce((sum, window) => sum + window.score, 0) / Math.max(1, mergedWindows.length)) / 2)).toFixed(2)),
    };
  });
};

export const isAboveThreshold = (profile: ServiceReadinessProfile, threshold = 70): boolean => profile.mean >= threshold;

export const profileByTopology = (topology: WorkloadTopology, seed = Date.now()): ServiceReadinessProfile => {
  const windows = topology.nodes.map((node, index) => {
    const base = clamp(node.averageDurationMinutes * 2 + index, 10, 100);
    const value = clamp(100 - Math.log(base + 1) * 8 - index * 2, 0, 100);
    return {
      at: toTimestamp(new Date(seed + index * 2 * 60 * 1000)),
      score: Number(value.toFixed(2)),
      band: bandOf(value),
      trigger: `node:${node.nodeId}`,
    };
  });

  const mean = Number((windows.reduce((acc, item) => acc + item.score, 0) / Math.max(1, windows.length)).toFixed(2));
  const trend = Number((windows.at(-1)?.score ?? 0) - (windows[0]?.score ?? 0));
  return {
    planId: topology.namespace as PlanId,
    namespace: topology.namespace,
    windows,
    mean,
    trend,
    confidence: Number(Math.max(0, 100 - topology.nodes.length * 2).toFixed(2)),
  };
};
