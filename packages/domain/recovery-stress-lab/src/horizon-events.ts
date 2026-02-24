import type {
  Brand,
  HorizonEventLabel,
  HorizonIdentity,
  HorizonScopeLabel,
  HorizonStage,
  HorizonTemplate,
  HorizonWorkspaceId,
  NoInfer,
} from './horizon-types';
import { baseTemplate, buildHorizonLabel } from './horizon-types';

export type EventEnvelopeVersion = 1 | 2;

export type EventPayloadKind = 'metric' | 'signal' | 'artifact' | 'control';

export interface EventEnvelopeMetadata {
  readonly kind: EventPayloadKind;
  readonly tenant: Brand<string, 'TenantId'>;
  readonly actor: string;
  readonly workspaceId: HorizonWorkspaceId;
  readonly trace: Brand<string, 'HorizonTrace'>;
  readonly version: EventEnvelopeVersion;
}

export interface EventEnvelopeBase<TName extends string, TPayload> {
  readonly name: TName;
  readonly payload: TPayload;
  readonly metadata: EventEnvelopeMetadata;
  readonly sequence: bigint;
  readonly occurredAt: string;
}

export interface EventEnvelope<TName extends string, TPayload> extends EventEnvelopeBase<TName, TPayload> {
  readonly namespace: HorizonScopeLabel;
  readonly stage: HorizonStage;
  readonly causationId?: Brand<string, 'CausationId'>;
}

export type EventForTemplate<T extends HorizonTemplate> = EventEnvelope<
  HorizonEventLabel<`${T['domain']}:default`, HorizonStage>,
  Record<string, unknown>
>;

export type EventNameOf<T> = T extends EventEnvelope<infer Name, unknown> ? Name : never;

export type EventPayloadOf<T> = T extends EventEnvelope<string, infer Payload> ? Payload : never;

export type EventRecordByName<T extends readonly EventEnvelope<string, unknown>[], TName extends EventNameOf<T[number]>> = EventEnvelope<
  TName,
  EventPayloadOf<Extract<T[number], { name: TName }>>
>;

export type EventRecordMap<T extends readonly EventEnvelope<string, unknown>[]> = {
  readonly [K in EventNameOf<T[number]>]: EventPayloadOf<Extract<T[number], { name: K }>>[];
};

export interface EventBusOptions {
  readonly tenant: string;
  readonly template: HorizonTemplate;
}

export type EventRoute<T extends HorizonTemplate> = {
  readonly namespace: T['domain'];
  readonly stages: T['stageOrder'];
};

export interface Observer<TName extends string, TPayload> {
  readonly topics: readonly TName[];
  receive(event: EventEnvelope<TName, TPayload>): Promise<void> | void;
}

export class HorizonEventCollector<TTemplate extends HorizonTemplate, TEvents extends readonly EventEnvelope<string, unknown>[]> {
  readonly #route: EventRoute<TTemplate>;
  readonly #state = new Map<TEvents[number]['name'], TEvents[number]>();
  readonly #history = new Map<string, TEvents[number]>();

  constructor(options: EventBusOptions & { readonly route?: Partial<EventRoute<TTemplate>> }) {
    this.#route = {
      namespace: options.template.domain,
      stages: options.template.stageOrder,
      ...(options.route ? options.route : {}),
    };
  }

  get route(): EventRoute<TTemplate> {
    return this.#route;
  }

  publish<TName extends EventNameOf<TEvents[number]>>(event: EventRecordByName<TEvents, TName>) {
    const record = event as TEvents[number];
    this.#state.set(event.name, record);
    this.#history.set(`${event.name}:${event.sequence}`, record);
  }

  snapshot(): EventRecordMap<TEvents> {
    return Object.fromEntries(this.#state) as unknown as EventRecordMap<TEvents>;
  }

  async stream(): Promise<readonly TEvents[number][]> {
    const values = [...this.#history.values()];
    return values.toSorted((left, right) => {
      const leftSequence = Number(left.sequence);
      const rightSequence = Number(right.sequence);
      if (leftSequence > rightSequence) {
        return 1;
      }
      if (leftSequence < rightSequence) {
        return -1;
      }
      return 0;
    });
  }
}

export class HorizonEventBus<TTemplate extends HorizonTemplate> {
  readonly #template: TTemplate;
  readonly #observers = new Map<string, Set<(event: EventEnvelope<string, unknown>) => void>>();
  readonly #history: EventEnvelope<string, unknown>[] = [];
  readonly #identity: HorizonIdentity;

  constructor(template: TTemplate, identity: HorizonIdentity) {
    this.#template = template;
    this.#identity = identity;
  }

  get template(): TTemplate {
    return this.#template;
  }

  subscribe<TName extends string>(
    topics: readonly TName[],
    observer: (event: EventEnvelope<TName, unknown>) => void,
  ): () => void {
    const callbacks = topics.map((topic) => {
      const key = String(topic);
      const bucket = this.#observers.get(key) ?? new Set();
      const wrapped = observer as (event: EventEnvelope<string, unknown>) => void;
      bucket.add(wrapped);
      this.#observers.set(key, bucket);
      return { key, wrapped };
    });

    return () => {
      for (const { key, wrapped } of callbacks) {
        const bucket = this.#observers.get(key);
        if (!bucket) {
          continue;
        }
        bucket.delete(wrapped);
        if (!bucket.size) {
          this.#observers.delete(key);
        }
      }
    };
  }

  publish<TStage extends HorizonStage, TPayload extends Record<string, unknown>>(
    name: `${NoInfer<TTemplate['domain']>}:${string}` & string,
    payload: TPayload,
    route: EventRoute<TTemplate>,
    metadata: Omit<EventEnvelopeMetadata, 'version'>,
    stage: TStage,
    causationId?: Brand<string, 'CausationId'>,
  ): void {
    if (!this.#template.stageOrder.includes(stage)) {
      throw new Error(`invalid stage for template ${this.#template.templateId}: ${stage}`);
    }

    const token = buildHorizonLabel(route.namespace, stage);
    const event: EventEnvelope<string, TPayload> = {
      name: token,
      payload,
      metadata: {
        ...metadata,
        version: baseTemplate.metricSchema['metric:coverage:assertions'] === 0 ? 1 : 2,
      },
      sequence: BigInt(this.#history.length),
      occurredAt: new Date().toISOString(),
      namespace: `${route.namespace}:default` as HorizonScopeLabel,
      stage,
      causationId,
    };

    this.#history.push(event);
    const observers = this.#observers.get(token);
    if (!observers) {
      return;
    }

    for (const observer of observers) {
      observer(event);
    }
  }

  async *events(): AsyncGenerator<EventEnvelope<string, unknown>> {
    for (const event of this.#history) {
      yield event;
    }
  }

  timeline(): readonly EventEnvelope<string, unknown>[] {
    return this.#history
      .toSorted((left, right) => Number(left.sequence - right.sequence))
      .map((entry) => ({ ...entry, metadata: { ...entry.metadata } }));
  }

  identity(): HorizonIdentity {
    return this.#identity;
  }
}
