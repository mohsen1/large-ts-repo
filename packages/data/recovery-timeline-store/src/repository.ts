import { Result } from '@shared/result';
import type { RecoveryTimeline, RecoveryTimelineEvent, RecoveryTelemetrySnapshot } from '@domain/recovery-timeline';
import { StoredTimelineRow, TimelineIndex } from './models';
import { TimelineFilter, TimelineFilterSchema } from './schema';
import { summarize, toStoredRow } from './mapper';
import { purgeExpired } from './retention';

export class InMemoryTimelineRepository {
  private index: TimelineIndex = {
    byId: {},
    byTeam: {},
  };

  private history: Record<string, StoredTimelineRow> = {};
  private telemetry: Record<string, RecoveryTelemetrySnapshot> = {};

  save(timeline: RecoveryTimeline, snapshot?: RecoveryTelemetrySnapshot): Result<StoredTimelineRow> {
    const parsed = TimelineFilterSchema.safeParse({
      timelineId: timeline.id,
      ownerTeam: timeline.ownerTeam,
      minRiskScore: 0,
      maxRiskScore: 100,
      includeSegments: false,
    });

    if (!parsed.success) {
      return { ok: false, error: parsed.error };
    }

    if (this.history[timeline.id]) {
      this.history[timeline.id].archived = true;
    }

    const row = toStoredRow(timeline, snapshot);
    this.history[row.timelineId] = row;
    this.telemetry[row.timelineId] = snapshot ?? this.telemetry[row.timelineId]!;

    this.index.byId[timeline.id] = timeline;
    const byTeam = this.index.byTeam[timeline.ownerTeam] ?? [];
    if (!byTeam.includes(timeline.id)) {
      byTeam.push(timeline.id);
    }
    this.index.byTeam[timeline.ownerTeam] = byTeam;
    return { ok: true, value: row };
  }

  load(id: string): Result<RecoveryTimeline> {
    const timeline = this.index.byId[id];
    if (!timeline) {
      return { ok: false, error: new Error(`timeline ${id} not found`) };
    }
    return { ok: true, value: timeline };
  }

  listByTeam(team: string): RecoveryTimeline[] {
    return (this.index.byTeam[team] ?? []).map((id) => this.index.byId[id]).filter((value): value is RecoveryTimeline => !!value);
  }

  query(filter: TimelineFilter = {}): RecoveryTimeline[] {
    const parsed = TimelineFilterSchema.safeParse(filter);
    if (!parsed.success) {
      return [];
    }

    const criteria = parsed.data;
    const timelines = Object.values(this.index.byId);
    const filtered = timelines.filter((timeline) => {
      if (criteria.timelineId && timeline.id !== criteria.timelineId) return false;
      if (criteria.ownerTeam && timeline.ownerTeam !== criteria.ownerTeam) return false;
      const riskyEvents = timeline.events.some(
        (event) => {
          if (criteria.minRiskScore !== undefined && event.riskScore < criteria.minRiskScore) return false;
          if (criteria.maxRiskScore !== undefined && event.riskScore > criteria.maxRiskScore) return false;
          if (criteria.state !== undefined && event.state !== criteria.state) return false;
          return true;
        },
      );
      if (criteria.state || criteria.minRiskScore !== undefined || criteria.maxRiskScore !== undefined) {
        if (!riskyEvents) {
          return false;
        }
      }
      if (criteria.query) {
        const target = criteria.query.toLowerCase();
        return timeline.name.toLowerCase().includes(target) || timeline.id.toLowerCase().includes(target);
      }
      return true;
    });

    return purgeExpired(filtered);
  }

  annotateEvents(timelineId: string, updater: (event: RecoveryTimelineEvent) => RecoveryTimelineEvent): Result<RecoveryTimeline> {
    const timeline = this.index.byId[timelineId];
    if (!timeline) {
      return { ok: false, error: new Error(`timeline ${timelineId} not found`) };
    }

    const next: RecoveryTimeline = {
      ...timeline,
      events: timeline.events.map(updater),
      updatedAt: new Date(),
    };
    this.index.byId[timelineId] = next;

    return { ok: true, value: next };
  }

  getSnapshot(id: string): RecoveryTelemetrySnapshot | undefined {
    return this.telemetry[id];
  }

  listSummaries(team?: string): ReturnType<typeof summarize>[] {
    const entries = team ? this.listByTeam(team) : Object.values(this.index.byId);
    return entries.map((timeline) => summarize(timeline));
  }
}
