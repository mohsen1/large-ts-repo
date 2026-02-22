import { z } from 'zod';

import { withBrand } from '@shared/core';

import type {
  FabricCandidate,
  FabricConstraint,
  FabricLink,
  FabricNode,
  FabricRoute,
  FabricScenario,
  FabricWindow,
} from './types';

type BrandedId<T extends string> = string & { readonly __brand: T };

const NodeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  zone: z.enum(['global', 'edge', 'core', 'satellite']),
  serviceId: z.string().min(1),
  tenantId: z.string().min(1),
  readiness: z.number().min(0).max(1),
  resilienceScore: z.number().min(0).max(100),
  capabilities: z.array(z.string()).default([]),
});

const LinkSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  latencyMs: z.number().min(1).max(120_000),
  costUnits: z.number().min(0),
  region: z.string().min(2),
});

const ConstraintSchema = z.object({
  code: z.enum(['rto', 'compliance', 'dependency', 'vendor', 'manual']),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  description: z.string().min(1),
});

const RouteSchema = z.object({
  id: z.string().min(1),
  sourceNode: z.string().min(1),
  targetNode: z.string().min(1),
  kind: z.enum(['primary', 'secondary', 'fallback']),
  capacity: z.number().min(1).max(10_000),
  estimatedDurationMinutes: z.number().min(1).max(10_000),
  constraints: z.array(ConstraintSchema).default([]),
});

const ObjectiveSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  targetRtoMinutes: z.number().min(1),
  targetRpoMinutes: z.number().min(0),
  maxConcurrentSteps: z.number().min(1).max(1_000),
  tags: z.array(z.string()).default([]),
});

const WindowSchema = z.object({
  startedAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  timezone: z.string().min(1),
  blackoutAt: z.array(z.string().datetime()).default([]).optional(),
});

export const FabricScenarioSchema = z.object({
  id: z.string().min(1),
  tenantId: z.string().min(1),
  objective: ObjectiveSchema,
  nodes: z.array(NodeSchema).min(1),
  links: z.array(LinkSchema),
  routes: z.array(RouteSchema),
  window: WindowSchema,
});

export const FabricCandidateSchema = z.object({
  id: z.string().min(1),
  scenarioId: z.string().min(1),
  planNodeIds: z.array(z.string().min(1)),
  routeIds: z.array(z.string().min(1)),
  rationale: z.string().min(1),
});

const asBrand = <T extends string>(value: string, tag: T): BrandedId<T> => withBrand(value, tag);

const toNode = (value: z.infer<typeof NodeSchema>): FabricNode => ({
  id: asBrand(value.id, 'FabricNodeId'),
  name: value.name,
  zone: value.zone,
  serviceId: withBrand(value.serviceId, 'ServiceId'),
  tenantId: withBrand(value.tenantId, 'TenantId'),
  readiness: value.readiness,
  resilienceScore: value.resilienceScore,
  capabilities: value.capabilities,
});

const toLink = (value: z.infer<typeof LinkSchema>): FabricLink => ({
  id: asBrand(value.id, 'FabricLinkId'),
  from: asBrand(value.from, 'FabricNodeId'),
  to: asBrand(value.to, 'FabricNodeId'),
  latencyMs: value.latencyMs,
  costUnits: value.costUnits,
  region: value.region,
});

const toConstraint = (value: z.infer<typeof ConstraintSchema>): FabricConstraint => ({
  code: value.code,
  severity: value.severity,
  description: value.description,
});

const toRoute = (value: z.infer<typeof RouteSchema>): FabricRoute => ({
  id: asBrand(value.id, 'FabricRouteId'),
  sourceNode: asBrand(value.sourceNode, 'FabricNodeId'),
  targetNode: asBrand(value.targetNode, 'FabricNodeId'),
  kind: value.kind,
  capacity: value.capacity,
  estimatedDurationMinutes: value.estimatedDurationMinutes,
  constraints: value.constraints.map((constraint) => toConstraint(constraint)),
});

const toWindow = (value: z.infer<typeof WindowSchema>): FabricWindow => ({
  startedAt: value.startedAt,
  endsAt: value.endsAt,
  timezone: value.timezone,
  blackoutAt: value.blackoutAt?.slice() ?? [],
});

export const validateFabricScenario = (value: unknown): FabricScenario => {
  const parsed = FabricScenarioSchema.parse(value);
  return {
    id: asBrand(parsed.id, 'FabricPlanId'),
    tenantId: withBrand(parsed.tenantId, 'TenantId'),
    objective: {
      id: asBrand(parsed.objective.id, 'FabricObjectiveId'),
      name: parsed.objective.name,
      targetRtoMinutes: parsed.objective.targetRtoMinutes,
      targetRpoMinutes: parsed.objective.targetRpoMinutes,
      maxConcurrentSteps: parsed.objective.maxConcurrentSteps,
      tags: parsed.objective.tags,
    },
    nodes: parsed.nodes.map(toNode),
    links: parsed.links.map(toLink),
    routes: parsed.routes.map(toRoute),
    window: toWindow(parsed.window),
  };
};

export const validateFabricCandidate = (value: unknown): FabricCandidate => {
  const parsed = FabricCandidateSchema.parse(value);
  return {
    id: asBrand(parsed.id, 'FabricCandidateId'),
    scenarioId: asBrand(parsed.scenarioId, 'FabricPlanId'),
    planNodeIds: parsed.planNodeIds.map((nodeId) => asBrand(nodeId, 'FabricNodeId')),
    routeIds: parsed.routeIds.map((routeId) => asBrand(routeId, 'FabricRouteId')),
    rationale: parsed.rationale,
  };
};
