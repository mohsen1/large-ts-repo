import type { RunId, SignalId, TimelineEventId, TenantId, WorkspaceId, PluginId } from './brands.js';

type StageName = 'discover' | 'model' | 'simulate' | 'optimize' | 'execute' | 'verify' | 'archive';

export interface TimelineEventCommon {
  readonly eventId: TimelineEventId;
  readonly runId: RunId;
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly pluginId: PluginId;
  readonly at: string;
  readonly stage: StageName;
}

export interface PluginStartedEvent extends TimelineEventCommon {
  readonly kind: 'plugin.started';
  readonly inputHash: string;
}

export interface PluginCompletedEvent extends TimelineEventCommon {
  readonly kind: 'plugin.completed';
  readonly outputCount: number;
  readonly outputSignalIds: readonly SignalId[];
  readonly durationMs: number;
  readonly success: boolean;
}

export interface SignalDerivedEvent extends TimelineEventCommon {
  readonly kind: 'signal.derived';
  readonly signalId: SignalId;
  readonly severity: 'low' | 'medium' | 'high';
  readonly tags: readonly string[];
}

export interface PolicyAdjustedEvent extends TimelineEventCommon {
  readonly kind: 'policy.adjusted';
  readonly policyId: string;
  readonly adjustments: readonly string[];
}

export type EcosystemEvent = PluginStartedEvent | PluginCompletedEvent | SignalDerivedEvent | PolicyAdjustedEvent;

export type StageMap<T extends string> = {
  readonly [K in StageName as `${K}.${T}`]: EcosystemEvent[];
};

export interface EventBundle<TKind extends EcosystemEvent['kind']> {
  readonly kind: TKind;
  readonly events: readonly Extract<EcosystemEvent, { kind: TKind }>[];
  readonly count: number;
}

export const isPluginStartedEvent = (event: EcosystemEvent): event is PluginStartedEvent => {
  return event.kind === 'plugin.started';
};

export const isPluginCompletedEvent = (event: EcosystemEvent): event is PluginCompletedEvent => {
  return event.kind === 'plugin.completed';
};

export const bucketByStage = (events: readonly EcosystemEvent[]): ReadonlyMap<string, readonly EcosystemEvent[]> => {
  const map = new Map<string, EcosystemEvent[]>();
  for (const event of events) {
    const bucket = map.get(event.stage) ?? [];
    bucket.push(event);
    map.set(event.stage, bucket);
  }
  return new Map(Array.from(map.entries()).map(([stage, bucket]) => [stage, bucket]));
};

export const groupByPlugin = (events: readonly EcosystemEvent[]): ReadonlyMap<string, readonly EcosystemEvent[]> => {
  const map = new Map<string, EcosystemEvent[]>();
  for (const event of events) {
    const bucket = map.get(event.pluginId) ?? [];
    bucket.push(event);
    map.set(event.pluginId, bucket);
  }
  return new Map(Array.from(map.entries()).map(([pluginId, bucket]) => [pluginId, bucket]));
};

export const partitionByKind = <TEvents extends readonly EcosystemEvent[]>(
  events: TEvents,
): {
  [K in TEvents[number] as K['kind']]: Extract<EcosystemEvent, { kind: K['kind'] }>[];
} => {
  const output: Partial<Record<EcosystemEvent['kind'], EcosystemEvent[]>> = {};
  for (const event of events) {
    const bucket = output[event.kind] ?? [];
    bucket.push(event);
    output[event.kind] = bucket;
  }
  return output as {
    [K in EcosystemEvent['kind']]: Extract<EcosystemEvent, { kind: K }>[];
  };
};
