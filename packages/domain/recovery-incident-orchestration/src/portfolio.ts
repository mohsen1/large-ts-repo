import type { IncidentRecord, IncidentId } from './types';
import { buildPlaybookCandidates, buildReadiness, type PlaybookTemplate, type PortfolioSlot } from './playbook-model';

export interface PortfolioPolicy {
  readonly tenantId: string;
  readonly maxPerIncident: number;
  readonly minSeverity: string[];
  readonly includeOnlyTagged: boolean;
}

export interface PortfolioPlan {
  readonly tenantId: string;
  readonly incidents: readonly IncidentId[];
  readonly slots: readonly PortfolioSlot[];
  readonly generatedAt: string;
  readonly policy: PortfolioPolicy;
}

export interface PortfolioDiff {
  readonly incidentId: IncidentId;
  readonly existingTemplateId?: string;
  readonly nextTemplateId?: string;
  readonly action: 'add' | 'replace' | 'keep';
}

const defaultPolicy: PortfolioPolicy = {
  tenantId: 'global',
  maxPerIncident: 5,
  minSeverity: ['low', 'medium', 'high', 'critical', 'extreme'],
  includeOnlyTagged: false,
};

const matchSeverity = (incident: IncidentRecord, policy: PortfolioPolicy): boolean =>
  policy.minSeverity.includes(incident.severity);

const rankSlots = (slots: readonly PortfolioSlot[]): readonly PortfolioSlot[] =>
  [...slots].sort((left, right) => {
    const leftScore = left.candidates[0]?.priority ?? 0;
    const rightScore = right.candidates[0]?.priority ?? 0;
    return rightScore - leftScore;
  });

export const buildPortfolioFromIncidents = (
  incidents: readonly IncidentRecord[],
  templates: readonly PlaybookTemplate[],
  rawPolicy: Partial<PortfolioPolicy> = {},
): PortfolioPlan => {
  const policy: PortfolioPolicy = {
    ...defaultPolicy,
    ...rawPolicy,
    minSeverity: rawPolicy.minSeverity ?? defaultPolicy.minSeverity,
    maxPerIncident: rawPolicy.maxPerIncident ?? defaultPolicy.maxPerIncident,
  };

  const filtered = incidents.filter((incident) => matchSeverity(incident, policy));
  const slots = filtered.flatMap((incident) => {
    const candidates = buildPlaybookCandidates(templates, incident)
      .slice(0, policy.maxPerIncident);
    if (candidates.length === 0) {
      return [];
    }
    const selectedTemplateId = candidates[0]?.template.id;
    return [{
      scope: incident.scope,
      incidentId: incident.id,
      candidates,
      selectedTemplateId,
      createdAt: new Date().toISOString(),
    }];
  });

  return {
    tenantId: policy.tenantId,
    incidents: [...new Set(filtered.map((incident) => incident.id))],
    slots: rankSlots(slots),
    generatedAt: new Date().toISOString(),
    policy,
  };
};

export const simulatePortfolioDiff = (
  current: PortfolioPlan,
  next: PortfolioPlan,
): readonly PortfolioDiff[] => {
  const diffs: PortfolioDiff[] = [];
  const nextById = new Map<string, PortfolioSlot>(
    next.slots.map((slot) => [String(slot.incidentId), slot]),
  );

  for (const slot of current.slots) {
    const nextSlot = nextById.get(String(slot.incidentId));
    if (!nextSlot) {
      diffs.push({
        incidentId: slot.incidentId,
        existingTemplateId: slot.selectedTemplateId ? String(slot.selectedTemplateId) : undefined,
        action: 'keep',
      });
      continue;
    }
    if (slot.selectedTemplateId !== nextSlot.selectedTemplateId) {
      diffs.push({
        incidentId: slot.incidentId,
        existingTemplateId: slot.selectedTemplateId ? String(slot.selectedTemplateId) : undefined,
        nextTemplateId: nextSlot.selectedTemplateId ? String(nextSlot.selectedTemplateId) : undefined,
        action: 'replace',
      });
      continue;
    }
    diffs.push({
      incidentId: slot.incidentId,
      existingTemplateId: slot.selectedTemplateId ? String(slot.selectedTemplateId) : undefined,
      nextTemplateId: nextSlot.selectedTemplateId ? String(nextSlot.selectedTemplateId) : undefined,
      action: 'keep',
    });
  }

  const currentSet = new Set(current.slots.map((slot) => String(slot.incidentId)));
  for (const slot of next.slots) {
    if (!currentSet.has(String(slot.incidentId))) {
      diffs.push({
        incidentId: slot.incidentId,
        nextTemplateId: slot.selectedTemplateId ? String(slot.selectedTemplateId) : undefined,
        action: 'add',
      });
    }
  }

  return diffs;
};

export const summarizePortfolio = (
  plan: PortfolioPlan,
): {
  readonly tenantId: string;
  readonly incidentCount: number;
  readonly slotCount: number;
  readonly changedCount: number;
} => ({
  tenantId: plan.tenantId,
  incidentCount: plan.incidents.length,
  slotCount: plan.slots.length,
  changedCount: plan.slots.reduce((acc, slot) => acc + (slot.selectedTemplateId ? 1 : 0), 0),
});

export const buildReadinessProfiles = (plan: PortfolioPlan): readonly {
  readonly incidentId: IncidentId;
  readonly readinessScore: number;
}[] => plan.slots.map((slot) => {
  const candidate = slot.candidates[0];
  if (!candidate) {
    return {
      incidentId: slot.incidentId,
      readinessScore: 0,
    };
  }
  const readiness = buildReadiness(candidate.template, {
    ...candidate.template,
    id: slot.incidentId,
    title: '',
    summary: '',
    openedAt: slot.createdAt,
    detectedAt: slot.createdAt,
    snapshots: [],
    signals: [],
    labels: [],
    metadata: {},
    scope: {
      tenantId: slot.scope.tenantId,
      region: slot.scope.region,
      clusterId: slot.scope.clusterId,
      serviceName: slot.scope.serviceName,
    },
    severity: 'low',
  } as IncidentRecord);
  return {
    incidentId: slot.incidentId,
    readinessScore: readiness.confidence,
  };
});
