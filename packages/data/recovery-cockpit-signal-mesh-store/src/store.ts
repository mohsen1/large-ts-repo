import { filterIterator, iteratorToArray, mapIterator, toDictionary, withNamespace } from './helpers';
import { MeshStoreRecord, MeshStoreRecordSchema, MeshStoreSignal } from './schema';
import { DynamoDBClient, PutItemCommand, GetItemCommand, ScanCommand } from '@aws-sdk/client-dynamodb';
import type {
  MeshEvent,
  MeshPlan,
  MeshRunId,
  MeshTopology,
  MeshExecutionPhase,
  MeshPlanId,
  MeshScopeLabel,
} from '@domain/recovery-cockpit-signal-mesh';
import type { Brand, NoInfer } from '@shared/type-level';
import type { Result } from '@shared/result';

type StackLike = {
  use<T extends { [Symbol.asyncDispose](): Promise<void> }>(resource: T): T;
  adopt<T extends object>(resource: T, onDispose: (value: T) => Promise<void> | void): T;
  [Symbol.asyncDispose](): Promise<void>;
};

type MaybeAsyncStack = { new (): StackLike };

const asyncStackCtor = (): MaybeAsyncStack => {
  const candidate = (globalThis as unknown as { AsyncDisposableStack?: MaybeAsyncStack }).AsyncDisposableStack;
  if (candidate) {
    return candidate;
  }
  return class FallbackStack implements StackLike {
    readonly #disposers: Array<() => Promise<void> | void> = [];
    use<T extends { [Symbol.asyncDispose](): Promise<void> }>(resource: T): T {
      this.adopt(resource, () => resource[Symbol.asyncDispose]());
      return resource;
    }
    adopt<T extends object>(resource: T, onDispose: (value: T) => Promise<void> | void): T {
      this.#disposers.push(() => onDispose(resource));
      return resource;
    }
    async [Symbol.asyncDispose](): Promise<void> {
      for (let i = this.#disposers.length - 1; i >= 0; i -= 1) {
        await this.#disposers[i]?.();
      }
    }
  };
};

const AsyncStackCtor = asyncStackCtor();

export type MeshRecordId = Brand<string, 'MeshRecordId'>;

const resolveDefaults = async () => ({
  namespace: 'recovery-cockpit-signal-mesh',
  ttlMs: 6 * 60 * 60 * 1000,
  tableName: process.env.COCKPIT_SIGNAL_MESH_TABLE ?? 'cockpit-signal-mesh-records',
});

const bootstrap = resolveDefaults();
const fallbackNamespace = 'recovery-cockpit-signal-mesh';

const runRecordKey = async (runId: MeshRunId): Promise<string> => {
  const resolved = await bootstrap;
  return withNamespace(resolved.namespace, runId);
};

export interface SignalMeshRecordStorage {
  savePlan(runId: MeshRunId, plan: MeshPlan): Promise<void>;
  loadPlan(runId: MeshRunId): Promise<MeshPlan | undefined>;
  appendEvent(runId: MeshRunId, event: MeshEvent): Promise<void>;
  listEvents(runId: MeshRunId, phase?: MeshExecutionPhase): AsyncIterable<MeshEvent>;
  clearRun(runId: MeshRunId): Promise<void>;
  [Symbol.asyncDispose]?(): Promise<void>;
}

export class InMemorySignalMeshStore implements SignalMeshRecordStorage {
  readonly #plans = new Map<MeshRunId, MeshPlan>();
  readonly #events = new Map<MeshRunId, MeshEvent[]>();

  async savePlan(runId: MeshRunId, plan: MeshPlan): Promise<void> {
    this.#plans.set(runId, structuredClone(plan) as MeshPlan);
    await Promise.resolve();
  }

  async loadPlan(runId: MeshRunId): Promise<MeshPlan | undefined> {
    return this.#plans.get(runId);
  }

  async appendEvent(_runId: MeshRunId, event: MeshEvent): Promise<void> {
    const existing = this.#events.get(event.runId) ?? [];
    const merged = [...existing, event];
    this.#events.set(event.runId, merged);
    await Promise.resolve();
  }

  async *listEvents(runId: MeshRunId, phase?: MeshExecutionPhase): AsyncIterable<MeshEvent> {
    const events = this.#events.get(runId) ?? [];
    const sequence = phase ? events.filter((event) => event.phase === phase) : events;
    for (const event of sequence) {
      yield event;
    }
  }

  async clearRun(runId: MeshRunId): Promise<void> {
    this.#plans.delete(runId);
    this.#events.delete(runId);
    await Promise.resolve();
  }

  readonly signalCount = (runId: MeshRunId): number => (this.#events.get(runId) ?? []).length;
}

export class DynamoSignalMeshStore implements SignalMeshRecordStorage {
  readonly #client = new DynamoDBClient({});
  readonly #stack = new AsyncStackCtor();
  constructor() {
    this.#stack.adopt(this.#client, async () => Promise.resolve());
  }

  async savePlan(runId: MeshRunId, plan: MeshPlan): Promise<void> {
    const resolved = await bootstrap;
    await this.#client.send(
      new PutItemCommand({
        TableName: resolved.tableName,
        Item: {
          pk: { S: await runRecordKey(runId) },
          sk: { S: 'plan' },
          payload: { S: JSON.stringify(plan) },
          ttl: { N: String(Date.now() + resolved.ttlMs) },
        },
      }),
    );
  }

  async loadPlan(runId: MeshRunId): Promise<MeshPlan | undefined> {
    const resolved = await bootstrap;
    const response = await this.#client.send(
      new GetItemCommand({
        TableName: resolved.tableName,
        Key: { pk: { S: await runRecordKey(runId) }, sk: { S: 'plan' } },
      }),
    );
    const raw = response.Item?.payload?.S;
    if (!raw) {
      return undefined;
    }
    return JSON.parse(raw) as MeshPlan;
  }

  async appendEvent(runId: MeshRunId, event: MeshEvent): Promise<void> {
    const resolved = await bootstrap;
    await this.#client.send(
      new PutItemCommand({
        TableName: resolved.tableName,
        Item: {
          pk: { S: await runRecordKey(runId) },
          sk: { S: `event#${event.eventId as string}` },
          payload: { S: JSON.stringify(event) },
          phase: { S: event.phase },
          ttl: { N: String(Date.now() + resolved.ttlMs) },
        },
      }),
    );
  }

  async *listEvents(runId: MeshRunId, phase?: MeshExecutionPhase): AsyncIterable<MeshEvent> {
    const resolved = await bootstrap;
    const response = await this.#client.send(
      new ScanCommand({
        TableName: resolved.tableName,
        FilterExpression: '#pk = :pk',
        ExpressionAttributeNames: { '#pk': 'pk' },
        ExpressionAttributeValues: { ':pk': { S: await runRecordKey(runId) } },
      }),
    );
    const items = response.Items ?? [];
    const events = items
      .filter((item: { sk?: { S?: string } }) => item.sk?.S?.startsWith('event#') === true)
      .map((item: { payload?: { S?: string } }) => {
        const payload = item.payload?.S;
        if (!payload) {
          return null;
        }
        const parsed = JSON.parse(payload);
        return isMeshEvent(parsed) ? (parsed as MeshEvent) : null;
      })
      .filter((event: MeshEvent | null): event is MeshEvent => event !== null && (phase === undefined || event.phase === phase));
    for (const event of events) {
      yield event;
    }
  }

  async clearRun(runId: MeshRunId): Promise<void> {
    await Promise.resolve();
  }

  async [Symbol.asyncDispose](): Promise<void> {
    await this.#stack[Symbol.asyncDispose]();
  }
}

export const isMeshEvent = (value: unknown): value is MeshEvent => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  return 'eventId' in value && 'runId' in value && 'phase' in value && 'name' in value;
};

export const buildTopologyRecord = (
  topology: MeshTopology,
  runId: MeshRunId,
): MeshStoreRecord => ({
  schemaVersion: 'v1',
  namespace: fallbackNamespace,
  runId,
  tenantId: topology.tenant as string,
  recordedAt: new Date().toISOString(),
  topology: {
    runId: runId as string,
    tenantId: topology.tenant as string,
    namespace: fallbackNamespace,
    nodes: topology.nodes.map((node) => ({
      nodeId: node.id as string,
      tenantId: node.tenant as string,
      regionId: node.region as string,
      phase: node.stage,
      health: node.health,
      signalCount: node.signals.length,
      metadata: node.metadata as Record<string, string | number | boolean>,
    })),
    edges: topology.edges.map((edge) => ({
      from: edge.from as string,
      to: edge.to as string,
      weight: edge.weight,
      policyIds: edge.policyIds.map((policyId) => policyId as string),
    })),
  },
  events: [],
});

export const encodeRecord = (record: MeshStoreRecord): string => MeshStoreRecordSchema.parse(record) && JSON.stringify(record);

export const decodeRecord = (payload: string): Result<MeshStoreRecord, Error> => {
  try {
    const parsed = JSON.parse(payload);
    const parsedRecord = MeshStoreRecordSchema.parse(parsed);
    return { ok: true, value: parsedRecord };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) };
  }
};

export const summarizeRecord = (record: MeshStoreRecord): string => `${record.tenantId}/${record.runId} ${record.events.length} events`;

export const mergeSignals = (left: readonly MeshStoreSignal[], right: readonly MeshStoreSignal[]): readonly MeshStoreSignal[] => {
  const merged = [...left, ...right];
  const seen = new Set<string>();
  return merged.filter((signal) => {
    if (seen.has(signal.eventId)) {
      return false;
    }
    seen.add(signal.eventId);
    return true;
  });
};

export const topologySummaryMap = (records: readonly MeshStoreRecord[]): Record<MeshRecordId, MeshStoreRecord> =>
  toDictionary(records.map((record) => [record.runId as MeshRecordId, record]));

export const summarizeTopologies = (records: readonly MeshStoreRecord[]): readonly string[] =>
  [...filterIterator(records, (record) => record.events.length > 0)].map((record) => summarizeRecord(record));

export const plansFromRecords = async (records: readonly MeshStoreRecord[]): Promise<readonly MeshPlan[]> => {
  const plans = mapIterator(records, (record) => ({
    id: `${record.runId}:seed` as MeshPlanId,
    tenant: record.tenantId as any,
    runId: record.runId as MeshRunId,
    label: `seed:${record.runId}`,
    scope: `${record.tenantId}/default` as MeshScopeLabel,
    intents: [],
    steps: [],
  }));
  const recovered = await iteratorToArray(plans);
  return recovered;
};

export const selectSignalsByConfidence = (
  signals: readonly MeshStoreSignal[],
  minimum: NoInfer<number>,
): readonly MeshStoreSignal[] => signals.filter((signal) => signal.confidence >= minimum);
