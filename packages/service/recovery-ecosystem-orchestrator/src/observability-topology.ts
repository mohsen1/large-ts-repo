import { asTenantId, type NamespaceTag, type RunId, type StageId } from '@domain/recovery-ecosystem-core';
import { createInMemoryStore, EcosystemQueryEngine, type EcosystemAuditEvent, type EcosystemStorePort } from '@data/recovery-ecosystem-store';
import { EcosystemMetricsCollector } from '@data/recovery-ecosystem-store';
import { createObservabilityService, type ObserveFrame, type TraceEnvelope } from './observability-service';
import { fail, ok, type Result } from '@shared/result';
import { asRunId } from '@domain/recovery-ecosystem-core';

interface CollectedWindow {
  readonly runId: RunId;
  readonly namespace: NamespaceTag;
  readonly tenant: ReturnType<typeof asTenantId>;
  readonly events: readonly EcosystemAuditEvent[];
  readonly fingerprint: string;
}

export interface TopologySnapshotRow {
  readonly runId: RunId;
  readonly namespace: NamespaceTag;
  readonly phase: string;
  readonly stageId: StageId;
  readonly fingerprint: string;
  readonly at: string;
}

export interface TopologyDigest {
  readonly namespace: NamespaceTag;
  readonly runs: readonly TopologySnapshotRow[];
  readonly summary: {
    readonly batch: {
      readonly namespace: NamespaceTag;
      readonly runCount: number;
      readonly eventCount: number;
      readonly signatures: readonly string[];
    };
    readonly stats: {
      readonly snapshots: number;
      readonly events: number;
      readonly namespaceCount: number;
      readonly lastFlush?: string;
    };
    readonly fingerprint: string;
  };
}

const toFingerprint = (frames: readonly { readonly event: TraceEnvelope['at'] }[]): string =>
  frames
    .map((entry) => `${entry.event}`)
    .toSorted()
    .join('|');

const pickStage = (event: EcosystemAuditEvent): StageId => (event.stageId as StageId | undefined) ?? ('stage:unknown' as StageId);

export const runToFingerprint = (runId: RunId, namespace: NamespaceTag): string =>
  `${runId}:${namespace}:${new Date().toISOString()}`;

export class TopologyObservabilityService {
  readonly #store: EcosystemStorePort;
  readonly #queryEngine: EcosystemQueryEngine;
  readonly #metricsCollector: EcosystemMetricsCollector;
  readonly #observability = createObservabilityService();

  public constructor(store: EcosystemStorePort = createInMemoryStore()) {
    this.#store = store;
    this.#queryEngine = new EcosystemQueryEngine(store);
    this.#metricsCollector = new EcosystemMetricsCollector(store);
  }

  public async digest(namespace: NamespaceTag): Promise<Result<TopologyDigest>> {
    const batch = await this.#queryEngine.queryBatch(namespace, 'tenant:default', 64);
    const windows = await this.#collectWindows(namespace);
    if (windows.length === 0) {
      return fail(new Error('topology-empty'), 'topology');
    }

    const framePayload = await this.#store.query(namespace);
    const envelopes: TraceEnvelope[] = [];
    for (const snapshot of framePayload) {
      envelopes.push({
        event: 'event:snapshot' as const,
        namespace: snapshot.namespace,
        at: snapshot.generatedAt,
        payload: snapshot.payload,
        signature: `snapshot:${snapshot.runId}:${snapshot.generatedAt}`,
      });
    }

    const runs = windows
      .map((window) => ({
        runId: window.runId,
        namespace: window.namespace,
        phase: window.events.at(-1)?.event ?? 'event:empty',
        stageId: pickStage(window.events.at(-1) ?? {
          namespace: window.namespace,
          runId: window.runId,
          tenant: window.tenant,
          at: new Date().toISOString(),
          event: 'event:bootstrap',
          payload: {},
        }),
        fingerprint: window.fingerprint,
        at: window.events.at(-1)?.at ?? new Date().toISOString(),
      }))
      .toSorted((left, right) => right.runId.localeCompare(left.runId));

    const stats = await this.#queryEngine.stats();
    const fingerprint = toFingerprint(envelopes as unknown as readonly { readonly event: string }[]);

    return ok({
      namespace,
      runs,
      summary: {
        batch,
        stats,
        fingerprint,
      },
    });
  }

  public async runFrames(
    namespace: NamespaceTag,
    runId: string,
    limit = 24,
  ): Promise<Result<readonly (TopologySnapshotRow & { readonly event: string })[]>> {
    const windows = await this.#collectWindows(namespace);
    const normalized = asRunId(runId);
    const rows: (TopologySnapshotRow & { readonly event: string })[] = [];

    for (const run of windows.filter((entry) => entry.runId === normalized || runId === 'latest')) {
      for (const event of run.events) {
        rows.push({
          runId: run.runId,
          namespace: run.namespace,
          phase: event.event,
          stageId: pickStage(event),
          fingerprint: run.fingerprint,
          at: event.at,
          event: event.event,
        });
      }
    }

    if (rows.length === 0) {
      return fail(new Error('run-window-empty'), 'topology');
    }

    return ok(rows.toSorted((left, right) => left.at.localeCompare(right.at)).slice(-limit));
  }

  async #collectWindows(namespace: NamespaceTag): Promise<readonly CollectedWindow[]> {
    const snapshots = await this.#store.query(namespace);
    const windows = await Promise.all(
      snapshots.map(async (snapshot) => ({
        runId: snapshot.runId,
        namespace,
        tenant: asTenantId(snapshot.tenant),
        events: await this.#collectFrames(snapshot.runId, namespace, snapshot.tenant),
        fingerprint: runToFingerprint(snapshot.runId, namespace),
      })),
    );

    return windows.toSorted((left, right) => {
      const leftEvent = left.events.at(0)?.at ?? '';
      const rightEvent = right.events.at(0)?.at ?? '';
      return rightEvent.localeCompare(leftEvent);
    });
  }

  async #collectFrames(runId: RunId, namespace: NamespaceTag, tenant: string): Promise<readonly EcosystemAuditEvent[]> {
    const stream = await this.#store.read(runId);
    const output: EcosystemAuditEvent[] = [];
    for await (const event of stream) {
      if (event.namespace !== namespace) {
        continue;
      }
      if (asTenantId(tenant) !== event.tenant) {
        continue;
      }
      output.push(event);
    }
    return output.toSorted((left, right) => left.at.localeCompare(right.at));
  }
}

export const createTopologyObservabilityService = (store?: EcosystemStorePort): TopologyObservabilityService =>
  new TopologyObservabilityService(store);
