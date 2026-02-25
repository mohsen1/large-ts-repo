import type { NoInfer } from '@shared/type-level';
import type { SuiteResult } from './orchestration-suite';
import { flow } from '@domain/recovery-lab-signal-studio';

export interface SuiteMetric {
  readonly key: string;
  readonly value: number;
}

export interface SuiteProfile {
  readonly score: number;
  readonly events: number;
  readonly windows: number;
  readonly signal: string;
}

interface TenantBucket {
  readonly tenant: string;
  readonly scores: number[];
  readonly windows: number;
  readonly events: number;
}

const parseTenant = (value: string): string => value.split('/')[0];

export const buildSuiteProfiles = <TOutput>(results: readonly SuiteResult<TOutput>[]): readonly SuiteProfile[] => {
  const grouped = new Map<string, TenantBucket>();
  for (const result of results) {
    const current = grouped.get(result.summary.tenant) ?? {
      tenant: result.summary.tenant,
      scores: [],
      windows: 0,
      events: 0,
    };
    grouped.set(result.summary.tenant, {
      tenant: current.tenant,
      scores: [...current.scores, result.summary.score],
      windows: current.windows + result.summary.windowCount,
      events: current.events + result.summary.eventCount,
    });
  }

  const profiles: SuiteProfile[] = [];
  for (const value of grouped.values()) {
    const score = value.scores.reduce((acc, score) => acc + score, 0) / Math.max(1, value.scores.length);
    profiles.push({
      score,
      events: value.events,
      windows: value.windows,
      signal: `${value.tenant}:${value.scores.length}`,
    });
  }

  return profiles.toSorted((left, right) => right.score - left.score);
};

export const aggregateSuiteProfiles = (profiles: readonly SuiteProfile[]): SuiteMetric[] => {
  return profiles.flatMap((entry) => [
    { key: `score:${entry.signal}`, value: entry.score },
    { key: `windows:${entry.signal}`, value: entry.windows },
    { key: `events:${entry.signal}`, value: entry.events },
  ]);
};

export const summarizeByTenant = <TOutput>(results: readonly SuiteResult<TOutput>[]): Map<string, SuiteProfile> => {
  const buckets = new Map<string, { readonly scores: number[]; readonly windows: number; readonly events: number }>();
  const profileMap = new Map<string, SuiteProfile>();

  for (const result of results) {
    const tenant = parseTenant(result.summary.tenant);
    const current = buckets.get(tenant) ?? { scores: [], windows: 0, events: 0 };
    buckets.set(tenant, {
      scores: [...current.scores, result.summary.score],
      windows: current.windows + result.summary.windowCount,
      events: current.events + result.summary.eventCount,
    });
  }

  for (const [tenant, bucket] of buckets.entries()) {
    const score = bucket.scores.reduce((acc, value) => acc + value, 0) / Math.max(1, bucket.scores.length);
    profileMap.set(tenant, {
      score,
      windows: bucket.windows,
      events: bucket.events,
      signal: `tenant:${tenant}`,
    });
  }

  return profileMap;
};

export const topSuiteProfiles = <TOutput>(
  results: readonly SuiteResult<TOutput>[],
  limit = 10,
): readonly SuiteProfile[] => buildSuiteProfiles(results).toSorted((left, right) => right.score - left.score).slice(0, limit);

export const mergeSuiteProfiles = (
  left: readonly SuiteProfile[],
  right: readonly SuiteProfile[],
): readonly SuiteProfile[] => {
  const normalized = new Map<string, SuiteProfile>();
  for (const profile of [...left, ...right]) {
    const current = normalized.get(profile.signal) ?? {
      score: 0,
      events: 0,
      windows: 0,
      signal: profile.signal,
    };
    normalized.set(profile.signal, {
      signal: profile.signal,
      score: (current.score + profile.score) / 2,
      events: current.events + profile.events,
      windows: current.windows + profile.windows,
    });
  }

  return [...normalized.values()]
    .toSorted((leftValue, rightValue) => leftValue.signal.length - rightValue.signal.length)
    .filter((entry) => entry.signal.length > 0);
};

export const scoreSeries = <TOutput>(results: readonly SuiteResult<TOutput>[]): readonly number[] => {
  return flow(results)
    .map((result, state) => result.summary.score * (state.index + 1))
    .toArray();
};

export const buildEventIndex = <TOutput>(
  results: readonly SuiteResult<TOutput>[],
): readonly [string, number][] => [...summarizeByTenant(results)].map(([tenant, profile]) => [tenant, profile.events]);

export const suiteTrend = <TOutput>(results: readonly SuiteResult<TOutput>[]): number => {
  const summary = buildSuiteProfiles(results);
  return summary.reduce((acc, entry) => acc + entry.score, 0) / Math.max(1, summary.length);
};

export const asMetrics = <TOutput>(results: readonly SuiteResult<TOutput>[], label: string): ReadonlyMap<string, number> => {
  const map = new Map<string, number>();
  for (const result of results) {
    map.set(`${label}:${result.summary.tenant}`, result.summary.score);
    map.set(`${label}:${result.summary.workspace}`, result.summary.windowCount);
  }
  return map;
};

export const collectNoInferSamples = <TOutput, TInput>(
  results: readonly SuiteResult<TOutput>[],
  input: NoInfer<TInput>,
): TInput => {
  void results;
  return input as TInput;
};
