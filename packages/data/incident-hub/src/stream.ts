export type EventType = 'incident.created' | 'incident.updated' | 'incident.resolved' | 'workspace.command' | 'health.alert';

export interface TypedEvent {
  readonly id: string;
  readonly type: string;
  readonly event: { [key: string]: unknown };
}

export interface EventPayload {
  readonly tenantId: string;
  readonly topic: string;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
  readonly source: string;
  readonly [key: string]: unknown;
}

export interface EventSubscriber {
  readonly id: string;
  readonly onEvent: (event: TypedEvent) => Promise<void> | void;
}

export interface EventObserver {
  readonly tenantId: string;
  readonly topic: string;
  emit(event: EventPayload): Promise<void>;
  subscribe(subscriber: EventSubscriber): () => void;
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export class InMemoryEventHub implements EventObserver {
  private readonly subscribers = new Map<string, Set<EventSubscriber>>();
  private readonly events: EventPayload[] = [];
  readonly tenantId: string;
  readonly topic: string;

  constructor(tenantId: string, topic = 'incident-hub') {
    this.tenantId = tenantId;
    this.topic = topic;
  }

  async emit(event: EventPayload): Promise<void> {
    this.events.push(clone(event));
    if (this.events.length > 200) {
      this.events.splice(0, this.events.length - 200);
    }
    const current = this.subscribers.get(event.topic) ?? new Set<EventSubscriber>();
    const typed: TypedEvent = {
      id: `${event.tenantId}:${event.timestamp}`,
      type: event.topic,
      event: {
        tenantId: event.tenantId,
        payload: event.payload,
        source: event.source,
      },
    };
    await Promise.all([...current].map((subscriber) => Promise.resolve(subscriber.onEvent(typed))));
  }

  subscribe(subscriber: EventSubscriber): () => void {
    const id = subscriber.id;
    const bucket = this.subscribers.get(this.topic) ?? new Set<EventSubscriber>();
    bucket.add(subscriber);
    this.subscribers.set(this.topic, bucket);
    return (): void => {
      const current = this.subscribers.get(this.topic);
      current?.delete(subscriber);
    };
  }

  getReplay(topic?: string): readonly EventPayload[] {
    if (!topic) return this.events;
    return this.events.filter((event) => event.topic === topic);
  }
}

export const createEventHub = (tenantId: string, topic = 'incident-hub'): InMemoryEventHub => new InMemoryEventHub(tenantId, topic);

export const isEventType = (value: string): value is EventType =>
  ['incident.created', 'incident.updated', 'incident.resolved', 'workspace.command', 'health.alert'].includes(value);
