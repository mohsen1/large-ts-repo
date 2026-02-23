import { type RecoveryAtlasFilter, type RecoveryAtlasWindowId, type RecoveryAtlasIncidentId, type RecoveryAtlasSnapshot } from '@domain/recovery-operations-atlas';

import { asAtlasStoreId, emptyStoreEnvelope, type AtlasStoreEnvelope, type AtlasStoreRecord, type AtlasRunbook } from './models';
import { dedupeByWindow, findByQuery, latestForIncident, sortByRecency } from './query';

export interface AtlasRepository {
  readonly upsertSnapshot: (record: AtlasStoreRecord) => void;
  readonly appendEvent: (windowId: RecoveryAtlasWindowId, event: { source: string }) => void;
  readonly getEnvelope: () => AtlasStoreEnvelope;
  readonly listFor: (incidentId?: RecoveryAtlasIncidentId, filter?: RecoveryAtlasFilter) => readonly AtlasStoreRecord[];
  readonly latestForIncident: (incidentId: RecoveryAtlasIncidentId) => AtlasStoreRecord | undefined;
}

export const createAtlasRepository = (seed?: AtlasStoreEnvelope): AtlasRepository => {
  let state: AtlasStoreEnvelope = {
    ...emptyStoreEnvelope(),
    ...(seed ?? {}),
  } as AtlasStoreEnvelope;

  return {
    upsertSnapshot(record: AtlasStoreRecord) {
      const withoutRecord = state.records.filter((existing) => existing.id !== record.id);
      state = {
        ...state,
        records: sortByRecency([...withoutRecord, record]),
      };
    },
    appendEvent(windowId, event) {
      const id = asAtlasStoreId(`runbook:${windowId}`);
      const existing = state.runbooks.find((runbook) => runbook.id === id);

      if (existing) {
        const index = state.runbooks.findIndex((runbook) => runbook.id === id);
        const updated: AtlasRunbook = {
          ...existing,
          eventHistory: [...existing.eventHistory, {
            ...event,
            type: 'runbook-event',
            at: new Date().toISOString(),
            message: 'appended event',
            severity: 'medium',
            metadata: {},
          }],
          persistedAt: new Date().toISOString(),
        };
        const updatedRunbooks = [...state.runbooks];
        updatedRunbooks[index] = updated;
        state = {
          ...state,
          runbooks: updatedRunbooks,
        };
      } else {
        state = {
          ...state,
          runbooks: [
            ...state.runbooks,
            {
              id,
              eventHistory: [
                {
                  ...event,
                  type: 'runbook-event',
                  at: new Date().toISOString(),
                  message: 'runbook started',
                  severity: 'low',
                  metadata: {},
                },
              ],
              persistedAt: new Date().toISOString(),
            },
          ],
        };
      }
    },
    getEnvelope() {
      return state;
    },
    listFor(incidentId, filter) {
      return dedupeByWindow(findByQuery(state.records, { incidentId, filter }));
    },
    latestForIncident(incidentId) {
      return latestForIncident(state.records, incidentId);
    },
  };
};

export const snapshotHistory = (repository: AtlasRepository): readonly RecoveryAtlasSnapshot[] => {
  return repository.getEnvelope().records.map((entry) => entry.snapshot);
};
