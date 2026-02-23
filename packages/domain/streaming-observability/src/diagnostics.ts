import { RunMetadata, StreamSnapshot } from './types';

export interface StreamIncident {
  incidentId: string;
  tenant: string;
  streamId: string;
  startedAt: string;
  endedAt?: string;
  severity: 1 | 2 | 3 | 4 | 5;
  summary: string;
}

export interface IncidentEnvelope {
  run: RunMetadata;
  snapshot: StreamSnapshot;
  incidents: StreamIncident[];
}

export interface HealthDrill {
  id: string;
  topic: string;
  precondition: string;
  command: string;
  expectedResult: string;
}

export interface HealthRunbook {
  id: string;
  tenant: string;
  topologyId: string;
  drills: HealthDrill[];
  runbooks: string[];
}

export const deriveIncidentId = (tenant: string, streamId: string, startedAt: string): string =>
  `${tenant}:${streamId}:${startedAt}`;

export const summarizeIncidents = (incidents: readonly StreamIncident[]): string[] =>
  incidents.map((incident) => `${incident.incidentId} (${incident.severity}) ${incident.summary}`);

export const openIncidentWindow = (
  snapshot: StreamSnapshot,
  severityThreshold: number,
): StreamIncident | null => {
  if (snapshot.signals.every((signal) => signal.score < severityThreshold)) {
    return null;
  }
  return {
    incidentId: deriveIncidentId(snapshot.tenant, snapshot.streamId, snapshot.capturedAt),
    tenant: snapshot.tenant,
    streamId: snapshot.streamId,
    startedAt: snapshot.capturedAt,
    severity: Math.max(...snapshot.signals.map((signal) => signal.score)) as 1 | 2 | 3 | 4 | 5,
    summary: `${snapshot.streamId} observed ${snapshot.signals.length} active signals`,
  };
};

export const defaultRunbook = (tenant: string, streamId: string): HealthRunbook => ({
  id: `${tenant}:${streamId}:default`,
  tenant,
  topologyId: streamId,
  drills: [
    {
      id: `${streamId}-drill-1`,
      topic: 'lag-pressure',
      precondition: 'consumer lag increasing for 3 consecutive windows',
      command: 'scale-up-consumers',
      expectedResult: 'lag trend down 30% over 5 mins',
    },
    {
      id: `${streamId}-drill-2`,
      topic: 'throughput-decline',
      precondition: 'events/s below 60% target',
      command: 'rebalance-partitions',
      expectedResult: 'partition utilization balanced across nodes',
    },
  ],
  runbooks: ['streaming-observability', 'incident-response'],
});
