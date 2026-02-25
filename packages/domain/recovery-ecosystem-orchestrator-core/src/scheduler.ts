import type { PluginName, PluginDependency } from '@shared/typed-orchestration-core';
import type { MeshPluginDefinition } from './plugins.js';
import type { PluginRuntimeContext } from './types.js';

export interface ScheduleSlot {
  readonly start: Date;
  readonly end: Date;
  readonly plugin: PluginName;
}

type IteratorChain<T> = IterableIterator<T> & {
  map<U>(mapper: (value: T) => U): IteratorChain<U>;
  toArray(): T[];
};

const iteratorFrom = (globalThis as { Iterator?: { from?: <T>(value: Iterable<T>) => IteratorChain<T> } }).Iterator?.from;

export type TimelineWindow = readonly [start: number, end: number];

export const normalizeWindow = (window: TimelineWindow): TimelineWindow => {
  const [start, end] = window;
  if (end < start) {
    return [start, start];
  }
  return [start, end];
};

const toSpanMs = (window: TimelineWindow): number => {
  const [start, end] = normalizeWindow(window);
  return end - start;
};

export type PluginWeight<TPlugin extends MeshPluginDefinition> = {
  readonly [K in TPlugin['stage']]: number;
};

const stageWeight: Readonly<Record<PluginRuntimeContext['stage'], number>> = {
  discover: 1,
  model: 1,
  simulate: 2,
  optimize: 2,
  execute: 3,
  verify: 1,
  archive: 1,
} as const;

export const rankPlugin = (plugin: MeshPluginDefinition): number => {
  const stage = plugin.stage;
  const dependencyCount = plugin.dependencies.length;
  return stageWeight[stage] + dependencyCount;
};

export const buildTimeline = <TPlugins extends readonly MeshPluginDefinition[]>(
  ordered: readonly PluginName[],
  _plugins: TPlugins,
  baseAt: Date = new Date(),
): readonly ScheduleSlot[] => {
  const cursor = baseAt.getTime();
  const slots: ScheduleSlot[] = [];
  for (const [index, pluginName] of ordered.entries()) {
    const duration = 500 + index * 97;
    const start = new Date(cursor + index * 1000);
    const end = new Date(cursor + index * 1000 + duration);
    slots.push({ plugin: pluginName, start, end });
  }
  return slots;
};

export const slotByWindow = (
  slots: readonly ScheduleSlot[],
): ReadonlyMap<string, readonly ScheduleSlot[]> => {
  const output = new Map<string, ScheduleSlot[]>();
  for (const slot of slots) {
    const day = slot.start.toISOString().slice(0, 10);
    const bucket = output.get(day) ?? [];
    bucket.push(slot);
    output.set(day, bucket);
  }
  return new Map(Array.from(output.entries()).map(([day, value]) => [day, value]));
};

export const toWindowedIterator = (
  windows: readonly TimelineWindow[],
): readonly TimelineWindow[] => {
  const iterator = iteratorFrom?.(windows);
  return iterator ? iterator.map((window) => normalizeWindow(window)).toArray() : windows.map(normalizeWindow);
};

export const summarizeWindows = (windows: readonly TimelineWindow[]): {
  readonly totalMs: number;
  readonly maxMs: number;
  readonly windows: readonly TimelineWindow[];
} => {
  const normalized = toWindowedIterator(windows);
  const totals = normalized.reduce(
    (acc, window) => {
      const span = toSpanMs(window);
      return {
        totalMs: acc.totalMs + span,
        maxMs: Math.max(acc.maxMs, span),
      };
    },
    { totalMs: 0, maxMs: 0 },
  );
  return {
    totalMs: totals.totalMs,
    maxMs: totals.maxMs,
    windows: normalized,
  };
};

export type PluginEdge<TLeft extends string, TRight extends string> = readonly [TLeft, TRight];

export type PluginDependencyMap<TPlugins extends readonly MeshPluginDefinition[]> = {
  [K in TPlugins[number]['name']]: readonly PluginDependency<K & PluginName>[];
};

export const collectDependencyPairs = <TPlugins extends readonly MeshPluginDefinition[]>(
  plugins: TPlugins,
): readonly PluginEdge<string, string>[] =>
  plugins.flatMap((plugin) =>
    plugin.dependencies.map((dependency) => [dependency as string, plugin.name] as const),
  );
