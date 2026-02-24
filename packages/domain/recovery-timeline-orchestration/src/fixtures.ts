import { z } from 'zod';
import {
  type RecoveryTimeline,
  type RecoveryTimelineEvent,
  type RecoveryTimelineSegment,
} from '@domain/recovery-timeline';
import { createConductorId, type ConductorId, type ConductorMode } from './types';

type TimelineFilter = {
  readonly ownerTeam?: string;
  readonly includeSegments?: boolean;
};

const now = Date.now();

const baseEvents = (timelineId: string): RecoveryTimelineEvent[] => [
  {
    id: `${timelineId}-prepare`,
    timelineId,
    title: 'initial-assessment',
    owner: 'ops-team',
    phase: 'prepare',
    start: new Date(now - 60 * 60 * 1000),
    end: new Date(now - 55 * 60 * 1000),
    state: 'completed',
    riskScore: 12,
    dependencies: [],
    metadata: { type: 'control-plane' },
    createdAt: new Date(now - 61 * 60 * 1000),
  },
  {
    id: `${timelineId}-mitigate`,
    timelineId,
    title: 'failover-orchestration',
    owner: 'recovery-ops',
    phase: 'mitigate',
    start: new Date(now - 50 * 60 * 1000),
    end: new Date(now - 35 * 60 * 1000),
    state: 'running',
    riskScore: 62,
    dependencies: [`${timelineId}-prepare`],
    metadata: { type: 'playbook' },
    createdAt: new Date(now - 60 * 60 * 1000),
  },
  {
    id: `${timelineId}-restore`,
    timelineId,
    title: 'service-restore',
    owner: 'recovery-ops',
    phase: 'restore',
    start: new Date(now - 30 * 60 * 1000),
    end: new Date(now - 18 * 60 * 1000),
    state: 'blocked',
    riskScore: 88,
    dependencies: [`${timelineId}-mitigate`],
    metadata: { type: 'rto' },
    createdAt: new Date(now - 60 * 60 * 1000),
  },
];

const baseSegments = (timelineId: string): RecoveryTimelineSegment[] => [
  {
    id: `${timelineId}-seg-prepare`,
    timelineId,
    name: 'prep',
    targetDurationMinutes: 15,
  },
  {
    id: `${timelineId}-seg-restore`,
    timelineId,
    name: 'restore',
    targetDurationMinutes: 25,
  },
];

const timelines: RecoveryTimeline[] = [
  {
    id: 'timeline-orchestration-1',
    name: 'dr-drill-orchestration',
    environment: 'prod',
    ownerTeam: 'Ops Team',
    events: baseEvents('timeline-orchestration-1'),
    segments: baseSegments('timeline-orchestration-1'),
    policyVersion: 'v1',
    createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(now - 10 * 60 * 1000),
  },
  {
    id: 'timeline-conductor-2',
    name: 'incident-resilience-runbook',
    environment: 'dr',
    ownerTeam: 'Ops Team',
    events: baseEvents('timeline-conductor-2'),
    segments: baseSegments('timeline-conductor-2'),
    policyVersion: 'v2',
    createdAt: new Date(now - 9 * 24 * 60 * 60 * 1000),
    updatedAt: new Date(now - 5 * 60 * 1000),
  },
];

export const conductorPluginCatalog = [
  {
    pluginId: 'timeline-plugin/ingest-a',
    namespace: 'timeline-orchestrator',
    phase: 'ingest',
    enabled: true,
    weight: 10,
    metadata: {
      name: 'ingest-graph',
      critical: true,
    },
  },
  {
    pluginId: 'timeline-plugin/plan-a',
    namespace: 'timeline-orchestrator',
    phase: 'plan',
    enabled: true,
    weight: 20,
    metadata: {
      name: 'plan-sanitizer',
      critical: true,
    },
  },
  {
    pluginId: 'timeline-plugin/simulate-a',
    namespace: 'timeline-orchestrator',
    phase: 'simulate',
    enabled: true,
    weight: 15,
    metadata: {
      name: 'simulator-core',
      critical: false,
    },
  },
] as const satisfies readonly {
  readonly pluginId: string;
  readonly namespace: string;
  readonly phase: string;
  readonly enabled: boolean;
  readonly weight: number;
  readonly metadata: {
    readonly name: string;
    readonly critical: boolean;
  };
}[];

const conductorProfileSchema = z.object({
  id: z.string().min(1),
  namespace: z.string().min(1),
  mode: z.enum(['observe', 'simulate', 'stabilize']),
  enabled: z.boolean(),
});

export const ConductorProfileSchema = z.array(conductorProfileSchema);
export type ConductorProfileEntry = z.infer<typeof ConductorProfileSchema>[number];

export function resolveProfileEntries(
  mode: ConductorMode,
): Promise<readonly ConductorProfileEntry[]> {
  const base = createConductorId(mode);
  return Promise.resolve(ConductorProfileSchema.parse([
    {
      id: base,
      namespace: 'recovery-timeline-conductor',
      mode,
      enabled: true,
    },
  ]));
}

export function resolveSessionId(mode: ConductorMode): ConductorId<ConductorMode> {
  return createConductorId(mode);
}

export function listTimelines(filter?: TimelineFilter): RecoveryTimeline[] {
  const all = [...timelines];
  if (!filter?.ownerTeam) {
    return all;
  }

  return all.filter((timeline) => timeline.ownerTeam === filter.ownerTeam);
}

export function getTimeline(id: string): RecoveryTimeline | undefined {
  return timelines.find((timeline) => timeline.id === id);
}
