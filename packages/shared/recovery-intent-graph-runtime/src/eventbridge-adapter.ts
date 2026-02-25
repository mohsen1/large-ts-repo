import { EventBridgeClient, PutEventsCommand, type PutEventsRequestEntry } from '@aws-sdk/client-eventbridge';
import type { Brand } from '@shared/type-level';
import type { IntentSignal } from './intent-types';

export type EventBridgeTenant = Brand<string, 'EventBridgeTenant'>;
export type EventBridgeWorkspace = Brand<string, 'EventBridgeWorkspace'>;

export interface EventBridgeRoute {
  readonly source: string;
  readonly detailType: string;
  readonly busName?: string;
}

export interface PublishedSignal {
  readonly tenant: EventBridgeTenant;
  readonly workspace: EventBridgeWorkspace;
  readonly signalType: string;
  readonly detailType: string;
  readonly eventCount: number;
}

const mapSignalToEntry = (signal: IntentSignal, route: EventBridgeRoute): PutEventsRequestEntry => ({
  DetailType: route.detailType,
  Source: route.source,
  Detail: JSON.stringify(signal),
  EventBusName: route.busName,
  Resources: [`tenant/${signal.tenant}`, `workspace/${signal.workspace}`],
});

export const emitIntentSignals = async (
  signals: readonly IntentSignal[],
  route: EventBridgeRoute,
): Promise<readonly PublishedSignal[]> => {
  if (signals.length === 0) {
    return [];
  }

  const groupedByTenant = signals.reduce<Record<string, typeof signals>>((accumulator, signal) => {
    accumulator[signal.tenant] = [...(accumulator[signal.tenant] ?? []), signal];
    return accumulator;
  }, {});

  const client = new EventBridgeClient();
  const outputs = await Promise.all(
    Object.entries(groupedByTenant).map(async ([tenant, tenantSignals]) => {
      const entries = tenantSignals.map((signal) => mapSignalToEntry(signal, route));
      const command = new PutEventsCommand({
        Entries: entries,
      });
      await client.send(command);
      return {
        tenant: tenant as EventBridgeTenant,
        workspace: tenantSignals[0]!.workspace as unknown as EventBridgeWorkspace,
        signalType: route.detailType,
        detailType: route.detailType,
        eventCount: entries.length,
      };
    }),
  );

  return outputs;
};
