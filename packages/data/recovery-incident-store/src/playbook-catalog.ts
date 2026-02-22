import { buildPortfolioFromIncidents, simulatePortfolioDiff, type PortfolioPolicy, type PortfolioPlan } from '@domain/recovery-incident-orchestration';
import type {
  IncidentRecord,
  IncidentId,
  PlaybookTemplate,
  PlaybookCandidate,
  PortfolioSlot,
} from '@domain/recovery-incident-orchestration';
import type { PlaybookAssignment } from '@domain/recovery-incident-orchestration';

export type { PlaybookAssignment };

export interface CatalogEnvelope {
  readonly template: PlaybookTemplate;
  readonly tenantId: string;
  readonly active: boolean;
}

export interface CatalogSnapshot {
  readonly tenantId: string;
  readonly templates: readonly CatalogEnvelope[];
  readonly assignments: readonly PlaybookAssignment[];
  readonly updatedAt: string;
}

export interface PlaybookSearch {
  readonly tenantId?: string;
  readonly ownerTeam?: string;
  readonly channel?: string;
  readonly minCommands?: number;
  readonly maxCommands?: number;
}

export class IncidentPlaybookCatalog {
  private readonly templates = new Map<string, CatalogEnvelope>();
  private readonly assignments = new Map<string, PlaybookAssignment[]>();

  registerTemplate(template: PlaybookTemplate, tenantId: string, active = true): void {
    this.templates.set(String(template.id), { template, tenantId, active });
  }

  removeTemplate(templateId: string): void {
    this.templates.delete(templateId);
    for (const [incidentId, entries] of this.assignments) {
      const next = entries.filter((entry) => String(entry.templateId) !== templateId);
      this.assignments.set(incidentId, next);
    }
  }

  listTemplates(includeInactive = false): readonly CatalogEnvelope[] {
    return [...this.templates.values()].filter((entry) => includeInactive || entry.active);
  }

  searchTemplates(criteria: PlaybookSearch): readonly CatalogEnvelope[] {
    return this.listTemplates().filter((entry) => {
      if (criteria.tenantId && entry.tenantId !== criteria.tenantId) {
        return false;
      }
      if (criteria.ownerTeam && entry.template.ownerTeam !== criteria.ownerTeam) {
        return false;
      }
      if (criteria.channel && !entry.template.channels.some((channel) => channel.name === criteria.channel)) {
        return false;
      }
      if (criteria.minCommands !== undefined && entry.template.commands.length < criteria.minCommands) {
        return false;
      }
      if (criteria.maxCommands !== undefined && entry.template.commands.length > criteria.maxCommands) {
        return false;
      }
      return true;
    });
  }

  createAssignments(
    incidents: readonly IncidentRecord[],
    policy: Partial<PortfolioPolicy>,
  ): PortfolioPlan {
    const templates = this.searchTemplates({
      tenantId: policy.tenantId,
      minCommands: 1,
    });
    const portfolio = buildPortfolioFromIncidents(
      incidents,
      templates.map((entry) => entry.template),
      policy,
    );
    this.reconcileAssignments(portfolio);
    return portfolio;
  }

  getAssignments(incidentId: IncidentId): readonly PlaybookAssignment[] {
    return [...(this.assignments.get(String(incidentId)) ?? [])];
  }

  snapshot(tenantId: string): CatalogSnapshot {
    return {
      tenantId,
      templates: this.listTemplates(),
      assignments: [...this.assignments.values()].flat(),
      updatedAt: new Date().toISOString(),
    };
  }

  compareSnapshots(previous: PortfolioPlan, next: PortfolioPlan) {
    return simulatePortfolioDiff(previous, next);
  }

  getTemplateCandidates(
    incident: IncidentRecord,
    templates: readonly CatalogEnvelope[],
  ): readonly PlaybookCandidate[] {
    const score = templates.map((entry) => entry.template).map((template) => ({
      template,
      priority: template.commands.length / Math.max(1, incident.signals.length + 1),
      reason: `commands=${template.commands.length}`,
    }));
    return score.sort((left, right) => right.priority - left.priority);
  }

  private reconcileAssignments(portfolio: PortfolioPlan): void {
    for (const slot of portfolio.slots) {
      const assignment: PlaybookAssignment = {
        id: slot.selectedTemplateId ?? ('unassigned-template' as PlaybookAssignment['id']),
        incidentId: slot.incidentId,
        templateId: slot.selectedTemplateId ?? ('unassigned-template' as PlaybookAssignment['templateId']),
        operator: `${portfolio.tenantId}-planner`,
        assignedAt: slot.createdAt,
      };
      const key = String(slot.incidentId);
      const current = this.assignments.get(key) ?? [];
      this.assignments.set(key, [...current, assignment]);
    }
  }
}
