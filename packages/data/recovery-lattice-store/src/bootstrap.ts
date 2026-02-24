import { asTenantId, asStreamId, asZoneId } from '@domain/recovery-lattice';
import { validateSignal, signalSeed } from './schema';
import { blankTopology, toTimeline, type LatticeBatchRequest } from './models';

export interface SeedCatalog {
  readonly generatedAt: string;
  readonly tenantId: string;
  readonly timelineCount: number;
  readonly timelineNames: readonly string[];
}

const loadSeedTimeline = (): LatticeBatchRequest => {
  const tenantId = asTenantId('tenant://seed');
  const streamId = asStreamId('stream://recovery-lattice-seed');
  const topology = blankTopology(streamId);

  const request: LatticeBatchRequest = {
    tenantId,
    streamId,
    topology,
    records: signalSeed.map((entry) => ({
      ...validateSignal(entry),
      tenantId: tenantId,
      zoneId: asZoneId(`zone://seed`),
      streamId,
    })),
    tags: ['seed', 'bootstrap', 'recovery'],
  };
  return request;
};

export const seedCatalog = Promise.resolve().then(() => {
  const timeline = toTimeline(loadSeedTimeline());
  const timelineNames = timeline.events.map((event) => `${event.streamId}:${event.level}`).toSorted();
  return {
    generatedAt: new Date().toISOString(),
    tenantId: timeline.tenantId as string,
    timelineCount: timeline.events.length,
    timelineNames,
  } as SeedCatalog;
});

export const catalog = seedCatalog;
