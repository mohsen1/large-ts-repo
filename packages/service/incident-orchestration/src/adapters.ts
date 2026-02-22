import { Envelope, createEnvelope } from '@shared/protocol';
import { IncidentRecord } from '@domain/incident-management';
import { IncidentPublisher } from '@infrastructure/incident-notifications';

// Local event naming shared between service and downstream consumers.
export interface IncidentManagementEvent<T extends Record<string, unknown> = Record<string, unknown>> {
  incident: IncidentRecord<T>;
  decision: string;
  reason: string;
}

export const incidentEnvelope = (incident: IncidentRecord, decision: string, reason: string): Envelope<IncidentManagementEvent> => {
  return createEnvelope('incident.orchestration.decision', {
    incident,
    decision,
    reason,
  }) as Envelope<IncidentManagementEvent>;
};

export const publishDecision = async (
  publisher: IncidentPublisher,
  incident: IncidentRecord,
  decision: string,
  reason: string,
): Promise<string> => {
  const envelope = incidentEnvelope(incident, decision, reason);
  return publisher.publish(envelope);
};
