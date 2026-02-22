import { MessageBus, TopicHandle, TopicName } from '@platform/messaging';
import { Result, ok, fail } from '@shared/result';
import { IncidentRecord } from '@domain/incident-management';
import { ExecutionEnvelope, DeploymentTrace, PlanEnvelope } from '@domain/operations-orchestration';
import { IncidentRepository } from '@data/incident-hub';
import { buildCursor } from '@data/query-models';
import { EventBridgeClient, PutEventsCommand, PutEventsCommandInput } from '@aws-sdk/client-eventbridge';
import { OperationsRun, OperationsRepository } from './models';

export interface PlanEnvelopeBuilder {
  build(run: OperationsRun): PlanEnvelope;
}

export interface RunPublisher {
  publish(envelope: ExecutionEnvelope): Promise<void>;
}

export interface RunAuditSink {
  emit(event: { runId: string; event: string; at: string }): Promise<void>;
}

export interface EventBridgeConfig {
  busName: string;
  region?: string;
}

export class InMemoryOperationsRepository implements OperationsRepository {
  private readonly runs = new Map<string, OperationsRun>();
  private readonly traces: DeploymentTrace[] = [];

  async upsert(run: OperationsRun): Promise<Result<void, Error>> {
    try {
      this.runs.set(run.requestId, run);
      return ok(undefined);
    } catch (error) {
      return fail(error as Error);
    }
  }

  async get(requestId: string): Promise<Result<OperationsRun | undefined, Error>> {
    return ok(this.runs.get(requestId));
  }

  async list(
    tenantId: string,
    cursor?: string,
    limit = 50,
  ): Promise<Result<{ items: OperationsRun[]; cursor?: string; hasMore: boolean }, Error>> {
    const all = [...this.runs.values()].filter((run) => run.command.tenantId === tenantId);
    const start = Number(String(cursor ?? '0')) || 0;
    const end = start + limit;
    return ok({
      items: all.slice(start, end),
      cursor: end < all.length ? buildCursor(end, limit) : undefined,
      hasMore: end < all.length,
    });
  }

  async append(trace: DeploymentTrace): Promise<Result<void, Error>> {
    this.traces.push(trace);
    return ok(undefined);
  }
}

export class BusRunPublisher implements RunPublisher {
  constructor(private readonly bus: MessageBus, private readonly topic: TopicName) {}

  async publish(envelope: ExecutionEnvelope): Promise<void> {
    await this.bus.publish(this.topic, envelope as any);
  }
}

export class AuditSink implements RunAuditSink {
  constructor(private readonly repo: IncidentRepository) {}

  async emit(event: { runId: string; event: string; at: string }): Promise<void> {
    const issue: IncidentRecord = {
      id: event.runId as any,
      tenantId: 'ops' as any,
      serviceId: 'operations' as any,
      title: `operations:${event.event}`,
      details: `event=${event.event}`,
      state: 'monitoring',
      triage: {
        tenantId: 'ops' as any,
        serviceId: 'operations' as any,
        observedAt: event.at,
        source: 'ops-auto',
        severity: 'sev3',
        labels: [],
        confidence: 1,
        signals: [],
      },
      createdAt: event.at,
      updatedAt: event.at,
    };
    await this.repo.appendSnapshot(issue);
  }
}

export class EventBridgeRunPublisher implements RunPublisher {
  private readonly client: EventBridgeClient;

  constructor(private readonly config: EventBridgeConfig) {
    this.client = new EventBridgeClient({ region: config.region ?? 'us-east-1' });
  }

  async publish(envelope: ExecutionEnvelope): Promise<void> {
    const command = new PutEventsCommand({
      Entries: [
        {
          EventBusName: this.config.busName,
          Source: 'operations.service',
          DetailType: envelope.kind,
          Time: new Date(envelope.initiatedAt),
          Detail: JSON.stringify(envelope),
        },
      ],
    } satisfies PutEventsCommandInput);

    await this.client.send(command);
  }
}

export const asIncidentHandle = (
  bus: MessageBus,
  topic: string,
): Promise<TopicHandle> => bus.subscribe({ topic: topic as any, group: 'operations-service' as any }, async () => Promise.resolve());

export class EnvelopeBuilder implements PlanEnvelopeBuilder {
  build(run: OperationsRun): PlanEnvelope {
    return {
      ...run.plan!,
      metadata: {
        source: 'runner',
        version: 1,
        dependencies: [],
      },
    };
  }
}
