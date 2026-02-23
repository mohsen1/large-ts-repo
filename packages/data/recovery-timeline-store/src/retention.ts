import { RecoveryTimeline } from '@domain/recovery-timeline';

interface RetentionPolicy {
  horizonDays: number;
  protectedTimelines: number;
}

const DEFAULT_POLICY: RetentionPolicy = {
  horizonDays: 180,
  protectedTimelines: 50,
};

function nowMs(): number {
  return Date.now();
}

export function purgeExpired(timelines: RecoveryTimeline[], policy: RetentionPolicy = DEFAULT_POLICY): RecoveryTimeline[] {
  const expiration = nowMs() - policy.horizonDays * 24 * 60 * 60 * 1000;
  const protectRecent = [...timelines].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()).slice(0, policy.protectedTimelines);
  const protectedIds = new Set(protectRecent.map((timeline) => timeline.id));

  return timelines.filter((timeline) => {
    if (protectedIds.has(timeline.id)) {
      return true;
    }
    return timeline.updatedAt.getTime() >= expiration;
  });
}

export function isArchiveEligible(updatedAt: Date, policy: RetentionPolicy = DEFAULT_POLICY): boolean {
  return nowMs() - updatedAt.getTime() > policy.horizonDays * 24 * 60 * 60 * 1000;
}
