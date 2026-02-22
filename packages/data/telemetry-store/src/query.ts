import { TimestampMs, TenantId, AlertMatch, TelemetryEnvelope, EventWindow, PolicyRule, RouteRule } from '@domain/telemetry-models';
import { summarizeBuckets } from '@domain/telemetry-models';
import { InMemoryEnvelopeStore, PolicyStore, InMemoryIncidentStore } from './repositories';
import { RepositoryBatch, EnvelopeStore, TelemetryPolicyStore } from './models';

export interface QueryStats {
  totalMatches: number;
  topSignal: string;
  byTenant: Record<string, number>;
}

export interface IncidentQueryInput {
  tenantId: TenantId;
  from: TimestampMs;
  to: TimestampMs;
  limit?: number;
}

export interface WindowedOutput<T> {
  windows: EventWindow<T>[];
  bucketSignature: string;
}

export class TelemetryAnalytics {
  constructor(
    private readonly envelopes: EnvelopeStore,
    private readonly policies: TelemetryPolicyStore,
    private readonly incidents: InMemoryIncidentStore,
  ) {}

  async queryByTenant(tenantId: TenantId, from: TimestampMs, to: TimestampMs): Promise<RepositoryBatch<TelemetryEnvelope>> {
    return this.envelopes.listByTenant(tenantId, { filter: { since: from, until: to } as never });
  }

  async topSignals(tenantId: TenantId, count = 5): Promise<string[]> {
    const page = await this.envelopes.listByTenant(tenantId, { limit: 500 });
    const payload = summarizeBuckets(page.items.map((item) => item.sample), []);
    const totals = Object.entries(payload.byTenant).reduce((acc, [id, total]) => {
      acc[id] = total;
      return acc;
    }, {} as Record<string, number>);
    return Object.keys(totals)
      .sort((left, right) => totals[right] - totals[left])
      .slice(0, count);
  }

  async policyCatalog(tenantId: TenantId): Promise<ReadonlyArray<PolicyRule>> {
    const all = await this.policies.all();
    return all.filter((rule) => rule.tenantId === tenantId);
  }

  async incidentHistory(input: IncidentQueryInput): Promise<ReadonlyArray<unknown>> {
    const records = await this.incidents.list(input.tenantId);
    return records.filter((item) => item.seenAt >= input.from && item.seenAt <= input.to).slice(0, input.limit ?? 100);
  }

  async summarizeMatches(matches: ReadonlyArray<AlertMatch>): Promise<QueryStats> {
    const byTenant: Record<string, number> = {};
    let top = '';
    let topCount = 0;
    const totals = matches.reduce<Record<string, number>>((acc, match) => {
      acc[match.tenantId] = (acc[match.tenantId] ?? 0) + 1;
      return acc;
    }, byTenant);

    for (const [tenant, count] of Object.entries(totals)) {
      if (count > topCount) {
        topCount = count;
        top = tenant;
      }
    }

    return { totalMatches: matches.length, topSignal: top, byTenant: totals };
  }
}

export const windowed = <T>(events: ReadonlyArray<T>, size: number, toWindow: (value: T) => TimestampMs): WindowedOutput<T> => {
  const windows: EventWindow<T>[] = [];
  if (events.length === 0 || size <= 0) {
    return { windows, bucketSignature: `${size}-${events.length}` };
  }
  const sorted = [...events].sort((left, right) => Number(toWindow(left) - toWindow(right)));
  for (let index = 0; index < sorted.length; index += size) {
    const bucket = sorted.slice(index, index + size);
    windows.push({
      start: toWindow(bucket[0]),
      end: toWindow(bucket[bucket.length - 1]),
      samples: bucket,
    });
  }
  return { windows, bucketSignature: `${sorted[0]}-${sorted.length}` };
}

export const loadRouteTargets = (rules: ReadonlyArray<RouteRule>, tenantId: TenantId): ReadonlyArray<RouteRule> => {
  return rules.filter((rule) => rule.tenantId === tenantId);
};
