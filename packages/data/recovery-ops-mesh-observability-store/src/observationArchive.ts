import { randomUUID } from 'node:crypto';
import { withBrand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import {
  buildObservationEnvelope,
  type ObservationRecord,
} from './records';
import {
  isObservationRecord,
  isAlertRecord,
  parseObservation,
  type ObservabilityEventRecord,
  type RecordCursor,
  type ObservabilityRecordEnvelope,
} from './types';
import {
  parseTopology,
  type MeshPayloadFor,
  type MeshPlanId,
  type MeshRunId,
  type MeshSignalKind,
  type MeshTopology,
} from '@domain/recovery-ops-mesh';
import type { ObservabilityStoreId } from './types';

const defaultArchiveTopology = parseTopology({
  id: 'mesh-archive-default-plan',
  name: 'mesh-observability-archive',
  version: '1.0.0',
  nodes: [],
  links: [],
  createdAt: Date.now(),
});

export interface ArchiveCursor {
  readonly token: ObservabilityStoreId<'cursor'>;
  readonly planId: MeshPlanId;
}

export interface ArchiveSnapshot {
  readonly planId: MeshPlanId;
  readonly topology: MeshTopology;
  readonly size: number;
  readonly ids: readonly string[];
}

export interface ArchivePlan {
  readonly topology: MeshTopology;
  readonly planId: MeshPlanId;
  readonly events: readonly ObservabilityEventRecord[];
}

export interface ArchiveRecord {
  readonly id: string;
  readonly token: string;
  readonly count: number;
}

type BucketMap = Map<MeshPlanId, readonly ArchivePlan[]>;

export class ObservabilityArchive {
  readonly #state = new Map<MeshPlanId, ArchivePlan[]>();
  readonly #topology = defaultArchiveTopology;
  #seed = 0;

  [Symbol.dispose](): void {
    this.#state.clear();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#state.clear();
  }

  private ensurePlan = (planId: MeshPlanId): ArchivePlan[] => {
    const current = this.#state.get(planId);
    if (current) {
      return current;
    }

    const first: ArchivePlan = {
      topology: this.#topology,
      planId,
      events: [],
    };
    this.#state.set(planId, [first]);
    return [first];
  };

  private emitToken = (planId: MeshPlanId): ObservabilityStoreId<'cursor'> => {
    this.#seed += 1;
    return withBrand(`cursor-${planId}-${Date.now()}-${this.#seed}`, 'obs-store-cursor');
  };

  append = (
    input: {
      readonly runId: MeshRunId;
      readonly planId: MeshPlanId;
      readonly topology: MeshTopology;
      readonly signal: MeshPayloadFor<MeshSignalKind>;
      readonly signalIndex: number;
      readonly source?: string;
    },
  ): ArchiveRecord => {
    const plans = this.ensurePlan(input.planId);
    const previous = plans.at(-1) ?? {
      topology: this.#topology,
      planId: input.planId,
      events: [],
    };
    const source = input.source ?? `source:${input.planId}`;
    const record: ObservabilityRecordEnvelope = buildObservationEnvelope(
      {
        runId: input.runId,
        planId: input.planId,
        topology: input.topology,
        signal: input.signal,
      },
      input.signalIndex,
    );

    const normalized = parseObservation({
      ...record,
      source,
    });
    const next: ArchivePlan = {
      topology: input.topology,
      planId: input.planId,
      events: [...previous.events, normalized],
    };

    this.#state.set(input.planId, [...plans.slice(0, -1), next]);
    return {
      id: withBrand(`${normalized.id}-${randomUUID()}`, 'obs-store-record'),
      token: this.emitToken(input.planId),
      count: next.events.length,
    };
  };

  all = <TPlan extends MeshPlanId>(planId: NoInfer<TPlan>): ArchivePlan[] => {
    return [...(this.#state.get(planId) ?? [])];
  };

  snapshot = <TPlan extends MeshPlanId>(planId: NoInfer<TPlan>): ArchiveSnapshot => {
    const archive = this.#state.get(planId);
    const events = archive?.at(-1)?.events ?? [];
    return {
      planId,
      topology: archive?.at(-1)?.topology ?? this.#topology,
      size: events.length,
      ids: events.map((record) => record.id),
    };
  };

  collect = async <TPlan extends MeshPlanId>(
    planId: NoInfer<TPlan>,
  ): Promise<readonly ObservabilityEventRecord[]> => {
    const records = this.#state.get(planId) ?? [];
    return [...records.flatMap((item) => item.events)].map((entry) =>
      isObservationRecord(entry) ? parseObservation(entry) : entry,
    );
  };

  cursor = <TPlan extends MeshPlanId>(planId: NoInfer<TPlan>): RecordCursor => {
    const snapshot = this.snapshot(planId);
    const records = this.#state.get(planId)?.flatMap((entry) => entry.events) ?? [];

    return {
      token: this.emitToken(planId),
      records,
      hasMore: records.length > 0,
    };
  };

  async *stream<TPlan extends MeshPlanId>(
    this: ObservabilityArchive,
    planId: NoInfer<TPlan>,
  ): AsyncGenerator<ObservabilityEventRecord> {
    const records = this.#state.get(planId) ?? [];
    const sorted = [...records.flatMap((entry) => entry.events)].toSorted(
      (left, right) => {
        const leftAt = isObservationRecord(left) ? left.at : left.emittedAt;
        const rightAt = isObservationRecord(right) ? right.at : right.emittedAt;
        return rightAt - leftAt;
      },
    );

    for (const event of sorted) {
      if (isAlertRecord(event)) {
        yield event;
      } else {
        yield event;
      }
    }
  };

  stats = <TPlan extends MeshPlanId>(planId: NoInfer<TPlan>) => {
    const records = this.#state.get(planId) ?? [];
    const latest = records.at(-1)?.events ?? [];
    const signalRecordCount = latest.filter(isObservationRecord).length;
    const alertRecordCount = latest.filter(isAlertRecord).length;
    const sources = Array.from(new Set(latest.filter(isObservationRecord).map((event) => event.source)));

    return {
      planId,
      totalEvents: latest.length,
      signalRecordCount,
      alertRecordCount,
      sources,
    };
  };
}

export const createArchive = (_planId?: MeshPlanId): ObservabilityArchive => {
  void _planId;
  return new ObservabilityArchive();
};

export const archiveDefaults = {
  topologyId: defaultArchiveTopology.id,
  source: withBrand('mesh-archive', 'obs-store-record'),
} as const;
