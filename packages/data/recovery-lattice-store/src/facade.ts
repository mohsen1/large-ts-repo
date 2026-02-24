import { InMemoryLatticeStore } from './store';
import { computeAlertVector, buildSummaryReport } from './telemetry';
import { catalog, type SeedCatalog } from './bootstrap';
import { buildRunManifest, ingestToStore, type IngestBatchPayload } from './ingest';
import { fail, type Result } from '@shared/result';
import type { LatticeBatchResult, LatticeQuery, LatticeTimeline } from './models';
import { blankTopology } from './models';

interface RuntimeFacadeDependencies {
  seed?: SeedCatalog;
}

export interface LatticeFacade {
  readonly seed: () => Promise<SeedCatalog>;
  readonly ingest: (payload: IngestBatchPayload) => Promise<Result<LatticeBatchResult, string>>;
  readonly query: (query: LatticeQuery) => Promise<readonly LatticeTimeline[]>;
  readonly alerts: (query: LatticeQuery) => Promise<readonly string[]>;
  readonly report: (query: LatticeQuery) => Promise<string>;
  readonly dispose: () => Promise<void>;
}

const createRuntimeStore = () => new InMemoryLatticeStore();

export const createLatticeStoreFacade = (deps: RuntimeFacadeDependencies = {}): LatticeFacade => {
  const store = createRuntimeStore();
  const catalogSource = deps.seed ?? catalog;

  return {
    seed: async () => catalogSource,
    ingest: async (payload) => {
      const manifestSignals = await buildRunManifest(payload.tenantId, payload.streamId, payload.payload);
      const manifest: IngestBatchPayload = {
        tenantId: payload.tenantId,
        streamId: payload.streamId,
        topology: payload.topology ?? blankTopology(payload.streamId),
        payload: manifestSignals,
      };
      return ingestToStore(store, manifest);
    },
    query: async (query) => {
      const timeline = await store.queryTimeline(query);
      return timeline.toSorted((left, right) => left.updatedAt.localeCompare(right.updatedAt));
    },
    alerts: (query) => computeAlertVector(store, query),
    report: async (query) => {
      const timeline = await store.queryTimeline(query);
      return buildSummaryReport(timeline);
    },
    dispose: async () => {
      await store[Symbol.asyncDispose]();
    },
  };
};

export const withLatticeStoreFacade = async <T>(
  handler: (facade: LatticeFacade) => Promise<T>,
): Promise<T> => {
  const facade = createLatticeStoreFacade();
  try {
    return await handler(facade);
  } finally {
    await facade.dispose();
  }
};
