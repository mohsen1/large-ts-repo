import { useMemo } from 'react';
import { type PluginEvent, type PluginId, type StudioRunOutput } from '@shared/cockpit-studio-core';

export type TimelineNode = {
  readonly index: number;
  readonly pluginId: PluginId;
  readonly at: string;
  readonly eventKind: PluginEvent['kind'];
  readonly payloadKeyCount: number;
  readonly status: 'queued' | 'running' | 'complete' | 'error';
};

export type StudioTimelineState = {
  readonly hasEvents: boolean;
  readonly nodes: readonly TimelineNode[];
  readonly byPlugin: Readonly<Record<PluginId, number>>;
};

const inferStatus = (kind: PluginEvent['kind']): TimelineNode['status'] => {
  if (kind.includes('error')) return 'error';
  if (kind.includes('warning')) return 'running';
  if (kind.includes('stage')) return 'complete';
  return 'queued';
};

const collectKeys = (value: unknown): readonly string[] => {
  if (!value || typeof value !== 'object') {
    return [];
  }
  return Object.keys(value).toSorted();
};

export const useStudioTimeline = (run?: StudioRunOutput): StudioTimelineState =>
  useMemo(() => {
    if (!run) {
      return {
        hasEvents: false,
        nodes: [],
        byPlugin: {},
      };
    }
    const byPlugin: Record<PluginId, number> = {};
    const nodes = run.events.map((event, index) => {
      const keyCount = collectKeys(event.data).length;
      const node: TimelineNode = {
        index,
        pluginId: event.pluginId,
        at: event.at,
        eventKind: event.kind,
        payloadKeyCount: keyCount,
        status: inferStatus(event.kind),
      };
      byPlugin[event.pluginId] = (byPlugin[event.pluginId] ?? 0) + 1;
      return node;
    });
    return {
      hasEvents: nodes.length > 0,
      nodes,
      byPlugin,
    };
  }, [run]);
