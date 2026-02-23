import { createEnvelope, Envelope } from '@shared/protocol';
import { InMemoryBus, type MessageBus, type TopicHandle, type TopicName } from '@platform/messaging';
import { Tracer, measure } from '@platform/observability';
import { buildExecutionPlan, summarizeExecutionPlan } from '@domain/incident-command-models/lab-workflow-model';
import type { RecoveryCommand } from '@domain/incident-command-models';

export interface CommandLabTelemetryEvent {
  readonly name: string;
  readonly planId: string;
  readonly tenantId: string;
  readonly timestamp: string;
  readonly details: Readonly<Record<string, string | number | boolean>>;
}

export interface LabTelemetryInput {
  readonly tenantId: string;
  readonly planId: string;
  readonly commandIds: readonly string[];
}

const toTopic = (tenantId: string): TopicName => `${tenantId}:command-lab-events` as TopicName;

export class CommandLabTelemetry {
  private readonly tracer = new Tracer();
  private readonly bus: MessageBus;
  private readonly publishedEvents: CommandLabTelemetryEvent[] = [];

  constructor(bus: MessageBus = new InMemoryBus()) {
    this.bus = bus;
  }

  async trackCreate(input: LabTelemetryInput, commands: readonly RecoveryCommand[]): Promise<void> {
    await measure(this.tracer, `lab-create:${input.planId}`, async () => {
      const executionPlan = buildExecutionPlan(input.tenantId, input.planId, commands);
      const summary = summarizeExecutionPlan(executionPlan);
      const event = this.composeEvent(input.tenantId, input.planId, 'command-lab:create', {
        commandCount: commands.length,
        sessionCount: summary.sessions,
      });
      await this.publish(event);
    });
  }

  async trackExecute(input: LabTelemetryInput, commandIds: readonly string[]): Promise<void> {
    const event = this.composeEvent(input.tenantId, input.planId, 'command-lab:execute', {
      commandCount: commandIds.length,
      commandIds: commandIds.join(','),
    });
    await this.publish(event);
  }

  async trackAnnotate(input: LabTelemetryInput, details: readonly string[]): Promise<void> {
    const event = this.composeEvent(input.tenantId, input.planId, 'command-lab:annotate', {
      detailCount: details.length,
    });
    await this.publish(event);
  }

  async publish(event: CommandLabTelemetryEvent): Promise<void> {
    this.publishedEvents.push(event);
    await this.bus.publish(
      toTopic(event.tenantId),
      createEnvelope(
        event.name,
        {
          payload: event,
          meta: {
            at: event.timestamp,
          },
        },
      ),
    );
  }

  async subscribe(tenantId: string, handler: (event: CommandLabTelemetryEvent) => Promise<void>): Promise<TopicHandle> {
    return this.bus.subscribe(
      { topic: toTopic(tenantId) },
      async (envelope) => {
        const value = envelope.payload;
        if (typeof value === 'object' && value && 'payload' in value) {
          const nested = (value as { payload: unknown }).payload;
          if (
            typeof nested === 'object' &&
            nested !== null &&
            typeof (nested as CommandLabTelemetryEvent).name === 'string' &&
            typeof (nested as CommandLabTelemetryEvent).tenantId === 'string'
          ) {
            await handler(nested as CommandLabTelemetryEvent);
          }
        }
      },
    );
  }

  getEvents(): readonly CommandLabTelemetryEvent[] {
    return [...this.publishedEvents];
  }

  getTracer(): Tracer {
    return this.tracer;
  }

  private composeEvent(
    tenantId: string,
    planId: string,
    name: string,
    details: Record<string, string | number | boolean>,
  ): CommandLabTelemetryEvent {
    return {
      name,
      planId,
      tenantId,
      timestamp: new Date().toISOString(),
      details,
    };
  }
}
