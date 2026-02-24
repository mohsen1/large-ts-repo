import { toPercent } from '@shared/util';
import type { ConstellationMode } from '@domain/recovery-cockpit-constellation-core';
import type { ConstellationRunSnapshot } from './types';
import type { InMemoryConstellationRunStore } from './store';

export type SnapshotDigest = {
  readonly total: number;
  readonly perMode: Readonly<Record<ConstellationMode, number>>;
};

export interface SnapshotReplayOptions {
  readonly includeHistory?: boolean;
  readonly modes?: readonly ConstellationMode[];
  readonly maxChunks?: number;
}

const chunkBy = (items: readonly ConstellationRunSnapshot[], size: number): readonly ConstellationRunSnapshot[][] => {
  const chunkSize = Math.max(1, size);
  const chunks: ConstellationRunSnapshot[][] = [];
  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }
  return chunks;
};

const topByMode = (
  rows: readonly ConstellationRunSnapshot[],
): Readonly<Record<ConstellationMode, number>> => rows.reduce<Record<ConstellationMode, number>>(
  (acc, row) => ({
    ...acc,
    [row.mode]: (acc[row.mode] ?? 0) + 1,
  }),
  {} as Record<ConstellationMode, number>,
);

const auditCoverage = (rows: readonly ConstellationRunSnapshot[]): number => {
  const withHistory = rows.filter((row) => row.audit.length > 0);
  return toPercent(withHistory.length, rows.length);
};

export const replayWorkspace = async (
  store: InMemoryConstellationRunStore,
  options: SnapshotReplayOptions = {},
): Promise<readonly ConstellationRunSnapshot[]> => {
  const includeHistory = options.includeHistory ?? false;
  const list = await store.list();
  if (!list.ok) return [];

  const filtered = includeHistory ? list.value : list.value.filter((row) => row.audit.length > 0);
  const modes = options.modes ?? [];
  const filteredModes = modes.length ? filtered.filter((row) => modes.includes(row.mode)) : filtered;

  const chunks = chunkBy(filteredModes, options.maxChunks ?? 25);
  const rows: ConstellationRunSnapshot[] = [];
  for (const chunk of chunks) {
    rows.push(...chunk);
  }
  return rows;
};

export const replayWorkspaceByMode = async (
  store: InMemoryConstellationRunStore,
  mode: ConstellationMode,
): Promise<readonly ConstellationRunSnapshot[]> => {
  const rows = await replayWorkspace(store);
  return rows.filter((row) => row.mode === mode);
};

export const digestWorkspace = async (
  store: InMemoryConstellationRunStore,
  options: SnapshotReplayOptions = {},
): Promise<SnapshotDigest & { coverage: number }> => {
  const rows = await replayWorkspace(store, options);
  return {
    total: rows.length,
    perMode: topByMode(rows),
    coverage: auditCoverage(rows),
  };
};
