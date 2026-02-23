import {
  type AlertSignal,
  type FabricTopology,
  type FabricCapacityProfile,
  type FabricNode,
  type FacilityId,
  type TenantId,
  type FabricPlan,
  type CommandId,
} from './models';

export interface ExternalIncidentShape {
  readonly tenant: string;
  readonly facility: string;
  readonly zone: string;
  readonly score: number;
  readonly metric: string;
  readonly at: string;
}

const toNumber = (value: number | string | undefined): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : 0;
};

export const adaptSignal = (tenant: string, external: ExternalIncidentShape): AlertSignal => ({
  id: `adapted-${external.facility}-${external.zone}-${external.at}` as CommandId,
  tenantId: tenant as TenantId,
  facilityId: external.facility as FacilityId,
  severity: external.score >= 0.9 ? 'critical' : external.score >= 0.7 ? 'warning' : 'notice',
  dimension: external.metric,
  value: toNumber(external.score * 100),
  baseline: 100,
  timestamp: external.at,
  tags: ['adapted', external.zone, tenant],
});

export const adaptTopologyFromCsv = (
  tenant: TenantId,
  rows: ReadonlyArray<Record<string, string | undefined>>,
): FabricTopology => {
  const nodes: FabricNode[] = rows
    .filter((row) => row.nodeId && row.facility)
    .map((row) => ({
      id: `node-${tenant}-${row.nodeId}` as any,
      facilityId: row.facility as FacilityId,
      role: (row.role as FabricNode['role']) || 'routing',
      health: (row.health as FabricNode['health']) || 'healthy',
      cpu: toNumber(row.cpu),
      mem: toNumber(row.mem),
      maxCapacity: toNumber(row.maxCapacity || '100'),
      observedAt: new Date().toISOString(),
    }));

  const profiles: FabricCapacityProfile[] = nodes.map((node) => {
    const offset = indexNode(node.id);
    return {
      region: `region-${offset}`,
      requestedQps: 100 + offset * 10,
      sustainableQps: 130 + offset * 8,
      headroom: 0.2 + offset * 0.01,
      projectedPeakQps: 150 + offset * 12,
    };
  });

  const edges = nodes.flatMap((from, index) => {
    const target = nodes[index + 1];
    if (!target) return [];
    return [
      {
        from: from.id,
        to: target.id,
        reliability: 0.78 + 0.02 * index,
        latencyMs: 45 + index * 10,
        capacity: 220 + index * 3,
        lastValidatedAt: new Date().toISOString(),
      },
    ];
  });

  return {
    tenantId: tenant,
    nodes,
    edges,
    profiles,
  };
};

export const attachPlanChecksum = (plan: FabricPlan): string => {
  const mapped = plan.steps.map((step) => {
    return {
      id: step.stepId,
      risk: step.risk,
      tags: step.tags,
    };
  });
  const fingerprint = JSON.stringify(mapped);
  let hash = 0;
  for (let index = 0; index < fingerprint.length; index += 1) {
    hash = (hash << 5) - hash + fingerprint.charCodeAt(index);
    hash |= 0;
  }
  return `${hash >>> 0}`;
};

const indexNode = (value: string): number => {
  const match = /-(\d+)$/.exec(value);
  if (match?.[1]) return Number.parseInt(match[1], 10) % 17;
  return Math.abs(
    value
      .split('')
      .reduce((acc, char) => acc + char.charCodeAt(0), 0) % 17,
  );
};
