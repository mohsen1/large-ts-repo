import { AdaptivePolicy, AdaptiveDecision, AdaptiveRun } from '@domain/adaptive-ops';
import { AdaptiveRunId, RunQuery, RunRow, RunPage, RunQuery as Query, RunQuery as _RunQuery } from './models';
import { AdaptiveRunStore } from './store';
import { parseCursor, buildCursor, filterRows, paginate } from './query';

export interface AdaptiveRunStoreAdapter {
  toRunId(value: string): AdaptiveRunId;
  save(run: AdaptiveRun): Promise<void>;
  appendDecision(runId: AdaptiveRunId, policy: AdaptivePolicy, decision: AdaptiveDecision): Promise<void>;
  get(runId: AdaptiveRunId): Promise<RunRow | null>;
  list(query: RunQuery): Promise<RunPage>;
}

export class AdaptiveRunStoreAdapterImpl implements AdaptiveRunStoreAdapter {
  constructor(private readonly store: AdaptiveRunStore) {}

  toRunId(value: string): AdaptiveRunId {
    return value as AdaptiveRunId;
  }

  async save(run: AdaptiveRun): Promise<void> {
    await this.store.saveRun(run);
  }

  async appendDecision(runId: AdaptiveRunId, policy: AdaptivePolicy, decision: AdaptiveDecision): Promise<void> {
    await this.store.appendDecision(runId, policy, decision);
  }

  async get(runId: AdaptiveRunId): Promise<RunRow | null> {
    return this.store.getRun(runId);
  }

  async list(query: Query): Promise<RunPage> {
    const cursor = parseCursor(query.cursor);
    const filtered = filterRows(await this.store.allRuns(), query);
    const page = paginate(filtered, cursor);
    const nextOffset = cursor.offset + page.length;
    const nextCursor = nextOffset < filtered.length ? buildCursor({ offset: nextOffset, pageSize: cursor.pageSize }) : undefined;
    return { rows: page, nextCursor };
  }
}

export const toPolicyFallback = (id: AdaptiveRunId): AdaptivePolicy => ({
  id: id as never,
  tenantId: 'tenant' as never,
  name: 'fallback',
  active: false,
  dependencies: [],
  window: {
    startsAt: new Date().toISOString(),
    endsAt: new Date().toISOString(),
    zone: 'us-east-1',
  },
  allowedSignalKinds: ['manual-flag'],
});

export { AdaptiveRunStore } from './store';
