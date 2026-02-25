import { fail, ok, type Result } from '@shared/result';
import { parseObservation, isObservationRecord, type RecordCursor, type ObservabilityEventRecord } from './types';
import type { InMemoryObservabilityStore } from './inMemoryObservabilityStore';
import type { MeshPlanId } from '@domain/recovery-ops-mesh';

const toObservationList = (records: readonly ObservabilityEventRecord[]): readonly ObservabilityEventRecord[] =>
  records.map((record) => ('signalIndex' in record ? parseObservation(record) : record));

export const collectObservabilityCursor = async (
  store: InMemoryObservabilityStore,
  planId: MeshPlanId,
  cursor?: string,
): Promise<RecordCursor> => {
  const snapshot = await store.streamSignals(planId);
  const hasToken = cursor?.length ? cursor.includes(snapshot.token) : true;
  const records = hasToken
    ? snapshot.records
    : snapshot.records.toSorted((left, right) => {
        const leftAt = 'signalIndex' in left ? left.at : left.emittedAt;
        const rightAt = 'signalIndex' in right ? right.at : right.emittedAt;
        return leftAt - rightAt;
      });

  return {
    ...snapshot,
    records,
  };
};

export const streamWithFilter = async function* (
  store: InMemoryObservabilityStore,
  planId: MeshPlanId,
  filter: (record: ObservabilityEventRecord) => boolean,
): AsyncGenerator<ObservabilityEventRecord, void, void> {
  for await (const event of store.watch(planId)) {
    if (filter(event)) {
      yield event;
    }
  }
};

export const collectSignals = async (
  store: InMemoryObservabilityStore,
  planId: MeshPlanId,
): Promise<Result<readonly ObservabilityEventRecord[], Error>> => {
  const snapshot = await store.readPlanEvents(planId);
  if (!snapshot.ok) {
    return fail(snapshot.error, snapshot.code);
  }

  const parsed = snapshot.value.filter(isObservationRecord);
  const normalized = toObservationList(parsed);

  return ok(
    normalized.toSorted((left, right) => ('signalIndex' in left ? left.at : left.emittedAt) - ('signalIndex' in right ? right.at : right.emittedAt)),
  );
};
