import { createEnvelope, type FailureSignal, type FailureActionPlan } from '@domain/failure-intelligence';
import { Envelope, type MessageId, type CorrelationId } from '@shared/protocol';
import { type MessageBus } from '@platform/messaging';

export interface ServiceBusAdapter {
  publishSignal(signal: FailureSignal): Promise<void>;
  publishPlan(plan: FailureActionPlan): Promise<void>;
}

export class FailureBusAdapter implements ServiceBusAdapter {
  constructor(private readonly bus: MessageBus, private readonly namespace: string) {}

  async publishSignal(signal: FailureSignal): Promise<void> {
    const envelope: Envelope<FailureSignal> = {
      ...createEnvelope('failure.signal.ingested', signal),
      id: `${Date.now()}` as MessageId,
      correlationId: `${this.namespace}:${Date.now()}` as CorrelationId,
    };
    await this.bus.publish(`${this.namespace}.signals` as any, envelope);
  }

  async publishPlan(plan: FailureActionPlan): Promise<void> {
    const envelope: Envelope<FailureActionPlan> = {
      ...createEnvelope('failure.plan.generated', plan),
      id: `${Date.now()}` as MessageId,
      correlationId: `${this.namespace}:plan:${Date.now()}` as CorrelationId,
    };
    await this.bus.publish(`${this.namespace}.plans` as any, envelope);
  }
}
