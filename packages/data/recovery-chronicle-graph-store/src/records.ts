import {
  asChronicleGraphEdgeId,
  asChronicleGraphNodeId,
  asChronicleGraphPlanId,
  asChronicleGraphRunId,
  asChronicleGraphRoute,
  asChronicleGraphTenantId,
  type ChronicleGraphBlueprint,
  type ChronicleGraphObservation,
  type ChronicleGraphPlanId,
  type ChronicleGraphRunId,
  type ChronicleGraphRoute,
  type ChronicleGraphScenario,
  type ChronicleGraphContext,
} from '@domain/recovery-chronicle-graph-core';
import { z } from 'zod';
import { type NoInfer } from '@shared/type-level';
import { type DeepReadonly } from '@shared/type-level';

export interface ChronicleGraphEventRecord {
  readonly runId: ChronicleGraphRunId;
  readonly scenario: ChronicleGraphPlanId;
  readonly tenant: string;
  readonly route: ChronicleGraphRoute;
  readonly nodeId: string;
  readonly event: ChronicleGraphObservation<unknown>;
  readonly createdAt: number;
}

export interface ChronicleGraphRunRecord {
  readonly runId: ChronicleGraphRunId;
  readonly scenario: ChronicleGraphPlanId;
  readonly tenant: string;
  readonly route: ChronicleGraphRoute;
  readonly status: 'ok' | 'failed' | 'partial';
  readonly startedAt: number;
  readonly finishedAt?: number;
  readonly score?: number;
}

export interface ChronicleGraphRecordSet<TState extends Record<string, unknown> = Record<string, unknown>> {
  readonly scenario: ChronicleGraphPlanId;
  readonly context: DeepReadonly<ChronicleGraphContext<TState>>;
  readonly blueprint: ChronicleGraphBlueprint;
  readonly events: ChronicleGraphEventRecord[];
  readonly runs: ChronicleGraphRunRecord[];
}

const eventSchema = z.object({
  runId: z.string(),
  scenario: z.string(),
  tenant: z.string(),
  route: z.string().min(8),
  nodeId: z.string(),
  createdAt: z.number().nonnegative(),
});

export const parseEventRecord = (input: unknown): ChronicleGraphEventRecord | undefined => {
  if (!input || typeof input !== 'object') return undefined;
  const parsed = eventSchema.safeParse(input);
  if (!parsed.success) return undefined;

  return {
    runId: asChronicleGraphRunId(asChronicleGraphTenantId(parsed.data.tenant), asChronicleGraphRoute(parsed.data.route)),
    scenario: asChronicleGraphPlanId(parsed.data.scenario),
    tenant: parsed.data.tenant,
    route: asChronicleGraphRoute(parsed.data.route),
    nodeId: parsed.data.nodeId,
    event: {
      id: asChronicleGraphRunId(asChronicleGraphTenantId(parsed.data.tenant), asChronicleGraphRoute(parsed.data.route)),
      nodeId: asChronicleGraphNodeId(parsed.data.nodeId),
      phase: 'phase:bootstrap',
      route: asChronicleGraphRoute(parsed.data.route),
      tenant: asChronicleGraphTenantId(parsed.data.tenant),
      timestamp: parsed.data.createdAt,
      status: 'running',
      payload: parsed,
    },
    createdAt: parsed.data.createdAt,
  };
};

export const buildDefaultBlueprint = (scenario: ChronicleGraphScenario): ChronicleGraphBlueprint => ({
  ...scenario.blueprint,
  nodes: [...scenario.blueprint.nodes],
  edges: [...scenario.blueprint.edges],
});

export const createSeedRecordSet = (
  scenario: ChronicleGraphScenario,
  route: ChronicleGraphRoute,
): ChronicleGraphRecordSet => ({
  scenario: scenario.id,
  context: {
    tenant: scenario.tenant,
    runId: asChronicleGraphRunId(scenario.tenant, route),
    planId: scenario.id,
    route,
    timeline: [route, asChronicleGraphNodeId('seed'), 'lane:control'],
    status: 'running',
    state: {
      reason: 'seeded',
      scenario: scenario.title,
    },
  },
  blueprint: buildDefaultBlueprint(scenario),
  events: [],
  runs: [
    {
      runId: asChronicleGraphRunId(scenario.tenant, route),
      scenario: scenario.id,
      tenant: scenario.tenant,
      route,
      status: 'partial',
      startedAt: Date.now(),
      score: 0,
    },
  ],
});

export const cloneRecordSet = <TState extends Record<string, unknown>>(
  recordSet: ChronicleGraphRecordSet<TState>,
  mutate: (input: NoInfer<ChronicleGraphRecordSet<TState>>) => NoInfer<ChronicleGraphRecordSet<TState>>,
): ChronicleGraphRecordSet<TState> => {
  return mutate({ ...recordSet });
};
