import {
  SurfacePluginRegistry,
  PluginSummary,
  evaluateRecords,
  summarizeByKind,
} from './registry';
import type { PluginExecutionRecord } from './registry';
import type {
  SurfaceContextSchema,
  SurfacePluginContract,
  ExtendedSurfaceRuntimeState,
} from './contracts';
import type { SurfaceWorkspaceId } from './identity';

export interface SurfaceRuntimeDiagnostics<TCatalog extends readonly SurfacePluginContract[] = readonly SurfacePluginContract[]> {
  readonly workspaceId: SurfaceWorkspaceId;
  readonly summary: PluginSummary<TCatalog>;
  readonly records: readonly PluginExecutionRecord[];
  readonly context: SurfaceContextSchema;
  readonly score: number;
}

export interface SurfaceRuntimeManifest {
  readonly workspaceId: SurfaceWorkspaceId;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly laneCounts: readonly Readonly<[string, number]>[];
}

type LatencyTuple<TRecords extends readonly PluginExecutionRecord[]> = {
  [Index in keyof TRecords]: TRecords[Index] extends PluginExecutionRecord
    ? readonly [TRecords[Index]['pluginId'], number]
    : never;
};

const normalizeId = <TId extends string>(value: TId): `diag:${TId}` => `diag:${value}`;

export const describeState = (state: ExtendedSurfaceRuntimeState): string =>
  `${state.workspaceId}@${state.stage}(${state.activePluginIds.length}/${state.nextTickAt})`;

export const summarizeExecution = <TCatalog extends readonly SurfacePluginContract[]>(
  workspaceId: SurfaceWorkspaceId,
  registry: SurfacePluginRegistry<TCatalog>,
  context: SurfaceContextSchema,
): SurfaceRuntimeDiagnostics<TCatalog> => {
  const records = registry.snapshots();
  const grouped = evaluateRecords(records);
  const score = records.length === 0 ? 0 : Math.round((grouped.ok / Math.max(1, records.length)) * 100);
  return {
    workspaceId,
    summary: registry.summary,
    records,
    context,
    score,
  };
};

export const recordDurations = <TRecords extends readonly PluginExecutionRecord[]>(
  records: TRecords,
): LatencyTuple<TRecords> => records.map((record) => [
  normalizeId(record.pluginId),
  record.endedAt - record.startedAt,
]) as LatencyTuple<TRecords>;

export const byPlugin = (
  records: readonly PluginExecutionRecord[],
): Readonly<Record<string, PluginExecutionRecord[]>> =>
  records.reduce((acc, record) => {
    const next = { ...acc } as Record<string, PluginExecutionRecord[]>;
    const existing = next[record.pluginId] ?? [];
    next[record.pluginId] = [...existing, record];
    return next;
  }, {} as Record<string, PluginExecutionRecord[]>);

export const sortPluginsByFailureRate = (records: readonly PluginExecutionRecord[]): readonly string[] => {
  const counts = byPlugin(records);
  return (Object.entries(counts) as Array<[string, PluginExecutionRecord[]]>)
    .map(([pluginId, pluginRecords]) => ({
      pluginId,
      bad: pluginRecords.filter((entry) => !entry.ok).length,
    }))
    .toSorted((left, right) => right.bad - left.bad)
    .map((entry) => entry.pluginId);
};

export const laneMatrix = (
  records: readonly PluginExecutionRecord[],
): Record<string, { total: number; ok: number; error: number }> => {
  const grouped = summarizeByKind(records);
  const result: Record<string, { total: number; ok: number; error: number }> = {};

  for (const [lane, entries] of Object.entries(grouped) as Array<[
    keyof typeof grouped & string,
    PluginExecutionRecord[],
  ]>) {
    const ok = entries.filter((entry) => entry.ok).length;
    result[lane] = {
      total: entries.length,
      ok,
      error: entries.length - ok,
    };
  }

  return result;
};

export const buildManifest = (diagnostics: SurfaceRuntimeDiagnostics): SurfaceRuntimeManifest => {
  const laneEntries = Object.entries(
    diagnostics.records.reduce((acc, record) => {
      const previous = acc[record.kind] ?? 0;
      return {
        ...acc,
        [record.kind]: previous + 1,
      };
    }, {} as Record<string, number>),
  );

  const pairs = laneEntries
    .map(([lane, count]) => [lane, count] as Readonly<[string, number]>)
    .toSorted((left, right) => left[0].localeCompare(right[0]));

  const baseline = {
    workspaceId: diagnostics.workspaceId,
    startedAt: Date.now() - diagnostics.context.createdAt,
    endedAt: Date.now(),
  } satisfies Omit<SurfaceRuntimeManifest, 'laneCounts'>;

  return {
    ...baseline,
    laneCounts: pairs,
  };
};

export const diagnosticSignal = (id: string, score: number): `${string}:${number}` => `${id}:${score}`;
