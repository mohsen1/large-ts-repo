import type { IncidentId, IncidentRecord } from '@domain/recovery-incident-orchestration';
import {
  buildPlaybookTemplate,
  buildPortfolioFromIncidents,
  buildReadinessProfiles,
  buildReadiness,
  type PlaybookTemplate,
  type PortfolioPlan,
  type PortfolioPolicy,
} from '@domain/recovery-incident-orchestration';
import type { QueryResult, RecoveryIncidentRepository, IncidentPlanRecord, IncidentStoreState } from '@data/recovery-incident-store';
import {
  IncidentPlaybookCatalog,
  buildPlaybookDashboardState,
  summarizeAssignments,
  normalizeAssignments,
  selectAssignmentsByTenant,
} from '@data/recovery-incident-store';

export interface PlaybookOrchestratorConfig {
  readonly tenantId: string;
  readonly maxCandidates: number;
  readonly requireOwnerApproval: boolean;
}

export interface PlaybookOrchestrationResult {
  readonly portfolio: PortfolioPlan;
  readonly assignedTemplates: readonly {
    readonly incidentId: IncidentId;
    readonly templateId: string;
    readonly reason: string;
  }[];
  readonly summaries: readonly {
    readonly incidentId: IncidentId;
    readonly readiness: number;
    readonly candidateCount: number;
  }[];
}

export interface PlaybookSimulationInput {
  readonly tenantId: string;
  readonly templateSeed: string;
  readonly limit?: number;
}

export interface PlaybookSimulationResult {
  readonly ok: boolean;
  readonly estimatedMinutes: number;
  readonly estimatedCommands: number;
  readonly issueCount: number;
}

export interface PlaybookDashboardState {
  readonly state: ReturnType<typeof buildPlaybookDashboardState>;
  readonly assignmentCount: number;
  readonly issueCount: number;
}

interface PortfolioAssignmentCount {
  readonly incidentId: string;
  readonly count: number;
}

export class RecoveryPlaybookOrchestrator {
  private readonly catalog = new IncidentPlaybookCatalog();

  constructor(
    private readonly repository: RecoveryIncidentRepository,
    private readonly config: PlaybookOrchestratorConfig,
  ) {}

  registerTemplate(seed: {
    title: string;
    tenantId: string;
    category: string;
    ownerTeam: string;
    commands: readonly { command: string; owner: string; minimumReadiness: number; maxRetry: number; windowMinutes: number }[];
    tags: readonly string[];
  }): void {
    const template = buildPlaybookTemplate({
      title: seed.title,
      category: seed.category,
      tenantId: seed.tenantId,
      ownerTeam: seed.ownerTeam,
      commands: [...seed.commands],
      channels: [{
        name: 'default',
        enabled: true,
        timeoutMinutes: 12,
        parallelism: 2,
      }],
      tags: [...seed.tags],
    });
    this.catalog.registerTemplate(template, seed.tenantId, true);
  }

  async buildPortfolioFromRepository(policy: Partial<PortfolioPolicy>): Promise<PortfolioPlan> {
    const incidents = await this.repository.findIncidents({
      tenantId: this.config.tenantId,
      unresolvedOnly: true,
      limit: this.config.maxCandidates,
    });

    return buildPortfolioFromIncidents(incidents.data, this.catalogTemplates(), policy);
  }

  async upsertFromSignals(raw: string[]): Promise<PlaybookOrchestrationResult> {
    const incidents = await this.repository.findIncidents({
      tenantId: this.config.tenantId,
      limit: this.config.maxCandidates,
    });
    const selected = incidents.data.filter((incident) => raw.length === 0 || raw.includes(String(incident.id)));
    const portfolio = buildPortfolioFromIncidents(selected, this.catalogTemplates(), {
      tenantId: this.config.tenantId,
      maxPerIncident: 4,
      minSeverity: ['low', 'medium', 'high', 'critical', 'extreme'],
      includeOnlyTagged: false,
    });
    const profiles = buildReadinessProfiles(portfolio);
    const assignedTemplates = selected.map((incident) => {
      const slot = portfolio.slots.find((entry) => entry.incidentId === incident.id);
      return {
        incidentId: incident.id,
        templateId: slot?.selectedTemplateId ? String(slot.selectedTemplateId) : 'unassigned',
        reason: slot?.candidates.at(0)?.reason ?? 'no candidates',
      };
    });

    return {
      portfolio,
      assignedTemplates,
      summaries: profiles.map((profile) => ({
        incidentId: profile.incidentId,
        readiness: profile.readinessScore,
        candidateCount: 1,
      })),
    };
  }

  async simulatePlaybookRun(seedIncidentId: IncidentId, input: PlaybookSimulationInput): Promise<PlaybookSimulationResult> {
    const incidents = await this.repository.findIncidents({
      tenantId: input.tenantId,
      limit: input.limit ?? 100,
    });
    const incident = incidents.data.find((entry) => entry.id === seedIncidentId || entry.labels.includes(input.templateSeed));
    if (!incident) {
      return { ok: false, estimatedMinutes: 0, estimatedCommands: 0, issueCount: 1 };
    }

    const candidates = this.catalog.getTemplateCandidates(incident, this.catalog.searchTemplates({
      tenantId: input.tenantId,
      minCommands: 1,
    }));
    if (candidates.length === 0) {
      return { ok: false, estimatedMinutes: 0, estimatedCommands: 0, issueCount: 2 };
    }

    const readiness = buildReadiness(candidates[0]?.template ?? fallbackTemplate(incident), incident);
    const estimatedCommands = candidates.reduce((acc, candidate) => acc + candidate.template.commands.length, 0);
    const estimatedMinutes = candidates.reduce((acc, candidate) => acc + candidate.template.commands.reduce((carry, command) => carry + command.windowMinutes, 0), 0);
    const issueCount = readiness.confidence < 0.5 ? 1 : 0;
    return {
      ok: issueCount === 0,
      estimatedMinutes: Math.max(1, Math.round(estimatedMinutes)),
      estimatedCommands,
      issueCount,
    };
  }

  async buildDashboardState(tenantId: string): Promise<PlaybookDashboardState> {
    const incidents = await this.repository.findIncidents({ tenantId, limit: this.config.maxCandidates });
    const assignments = this.portfolioAssignments(incidents.data);
    const plans = await collectPlanRecords(this.repository, incidents);
    const runs = await collectRunStore(this.repository, incidents);
    const store: IncidentStoreState = {
      incidents: incidents.data.map((incident) => ({
        id: incident.id,
        version: 1,
        label: incident.title,
        incident,
      })),
      plans,
      runs,
      events: [],
    };
    const snapshot = this.catalog.snapshot(tenantId);
    const tenantAssignments = selectAssignmentsByTenant(snapshot, tenantId);
    const normalized = normalizeAssignments(tenantAssignments);
    const summary = summarizeAssignments(tenantAssignments);

    return {
      state: buildPlaybookDashboardState(incidents.data, plans, tenantAssignments),
      assignmentCount: summary.total,
      issueCount: normalized.reduce((acc, row) => acc + (row.ageMinutes > 60 ? 1 : 0), 0),
    };
  }

  private catalogTemplates(): readonly PlaybookTemplate[] {
    return this.catalog.listTemplates().map((entry) => entry.template);
  }

  private portfolioAssignments(incidents: readonly IncidentRecord[]): readonly PortfolioAssignmentCount[] {
    const plan = this.catalog.createAssignments(incidents, {
      tenantId: this.config.tenantId,
      maxPerIncident: 4,
      minSeverity: ['low', 'medium', 'high', 'critical', 'extreme'],
      includeOnlyTagged: false,
    });
    return plan.slots.map((slot) => ({
      incidentId: String(slot.incidentId),
      count: slot.candidates.length,
    }));
  }
}

const collectPlanRecords = async (
  repository: RecoveryIncidentRepository,
  incidents: QueryResult<IncidentRecord>,
): Promise<readonly IncidentPlanRecord[]> => {
  const records = await Promise.all(incidents.data.map((incident) => repository.findPlans(incident.id)));
  return records.flat();
};

const collectRunStore = async (
  repository: RecoveryIncidentRepository,
  incidents: QueryResult<IncidentRecord>,
): Promise<IncidentStoreState['runs']> => {
  const runs = await Promise.all(incidents.data.map((incident) => repository.getRuns(incident.id)));
  return runs.flat().map((run) => ({
    id: `${run.id}:run`,
    runId: run.id,
    planId: run.planId,
    itemId: run.nodeId,
    run,
    status: run.state === 'failed' ? 'failed' : run.state === 'done' ? 'done' : 'running',
  }));
};

const fallbackTemplate = (incident: IncidentRecord): PlaybookTemplate => {
  const template = buildPlaybookTemplate({
    title: `fallback-${incident.title}`,
    category: 'fallback',
    tenantId: incident.scope.tenantId,
    ownerTeam: 'incident-ops',
    commands: [{
      command: 'triage',
      owner: 'oncall',
      minimumReadiness: 0.4,
      maxRetry: 1,
      windowMinutes: 20,
    }],
    channels: [{
      name: 'default',
      enabled: true,
      timeoutMinutes: 20,
      parallelism: 1,
    }],
    tags: ['fallback', incident.scope.serviceName],
  });
  return template;
};
