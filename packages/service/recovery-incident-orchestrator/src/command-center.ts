import { z } from 'zod';
import {
  type IncidentId,
  type IncidentPlan,
  type OrchestrationRun,
  type IncidentRecord,
  canApprove,
  createPlan,
  buildSeveritySignal,
  evaluatePolicy,
  policyDecision,
} from '@domain/recovery-incident-orchestration';
import type { IncidentQuery } from '@data/recovery-incident-store';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { RecoveryIncidentOrchestrator } from './runtime';
import { buildSummaryEvent, summarizeCommand, auditPlanDecision, summarizeRuns } from './insights';

export const commandInputSchema = z.object({
  tenantId: z.string().min(1),
  correlationId: z.string().min(1),
  incidentId: z.string().min(1),
  command: z.enum(['plan', 'execute', 'promote', 'refresh', 'query']),
  reason: z.string().optional(),
});

export type CommandInput = z.infer<typeof commandInputSchema>;
export type CommandStatus = 'accepted' | 'queued' | 'done' | 'rejected';

export interface CommandAudit {
  readonly command: CommandInput['command'];
  readonly incidentId: IncidentId;
  readonly status: CommandStatus;
  readonly statusMessage: string;
  readonly eventId: string;
}

export interface CommandCenterSnapshot {
  readonly policyApproved: boolean;
  readonly runCount: number;
  readonly failedRunCount: number;
  readonly severityScore: number;
}

export interface CommandCenterResult {
  readonly command: CommandInput;
  readonly status: CommandStatus;
  readonly message: string;
  readonly snapshot: CommandCenterSnapshot;
  readonly artifacts: readonly string[];
  readonly audits: readonly CommandAudit[];
}

interface CommandCenterContext {
  readonly repository: RecoveryIncidentRepository;
  readonly orchestrator: RecoveryIncidentOrchestrator;
}

const snapshotFromRuns = (incident: IncidentRecord, runs: readonly OrchestrationRun[]): CommandCenterSnapshot => ({
  policyApproved: runs.every((run) => run.state !== 'failed'),
  runCount: runs.length,
  failedRunCount: runs.filter((run) => run.state === 'failed').length,
  severityScore: buildSeveritySignal(incident).compositeScore,
});

export class RecoveryCommandCenter {
  constructor(private readonly deps: CommandCenterContext) {}

  async execute(raw: unknown): Promise<CommandCenterResult> {
    const parsed = commandInputSchema.safeParse(raw);
    if (!parsed.success) {
      return {
        command: raw as CommandInput,
        status: 'rejected',
        message: parsed.error.message,
        snapshot: this.emptySnapshot(),
        artifacts: ['invalid-input'],
        audits: [],
      };
    }

    const request = parsed.data;
    const eventId = `${request.correlationId}:${request.incidentId}:${request.command}`;

    const incidents = await this.deps.repository.findIncidents({
      tenantId: request.tenantId,
      unresolvedOnly: true,
      limit: 1000,
    });
    const incident = incidents.data.find((entry) => String(entry.id) === request.incidentId);
    if (!incident) {
      return {
        command: request,
        status: 'rejected',
        message: 'incident not found',
        snapshot: this.emptySnapshot(),
        artifacts: ['not-found'],
        audits: [{
          command: request.command,
          incidentId: request.incidentId as IncidentId,
          status: 'rejected',
          statusMessage: 'incident-not-found',
          eventId,
        }],
      };
    }

    const currentRuns = await this.deps.repository.getRuns(incident.id);
    const plans = await this.deps.repository.findPlans(incident.id);

    if (request.command === 'plan') {
      const generated = await this.deps.orchestrator.planForIncident(incident.id, request.correlationId);
      if (!generated) {
        return {
          command: request,
          status: 'rejected',
          message: 'plan not generated',
          snapshot: this.emptySnapshot(),
          artifacts: ['plan-failed'],
          audits: [{
            command: request.command,
            incidentId: incident.id,
            status: 'rejected',
            statusMessage: 'no-plan',
            eventId,
          }],
        };
      }

      const profile = evaluatePolicy(incident, request.correlationId, {
        incidentId: incident.id,
        maxRisk: 0.78,
        maxRouteLength: 12,
        maxBatchCount: 10,
        maxCriticalPathMinutes: 240,
      });
      const decision = policyDecision(profile);
      const summaryEvent = buildSummaryEvent(incident.id, request.command, {
        routeId: profile.planId,
        approved: decision.approved,
        reasons: decision.reasons,
      });

      return {
        command: request,
        status: decision.approved ? 'accepted' : 'rejected',
        message: decision.canAutoApprove ? 'plan auto-approved' : 'plan rejected',
        snapshot: snapshotFromRuns(incident, currentRuns),
        artifacts: [summaryEvent.payload.routeId],
        audits: [{
          command: request.command,
          incidentId: incident.id,
          status: decision.approved ? 'accepted' : 'rejected',
          statusMessage: `score=${decision.score}`,
          eventId,
        }],
      };
    }

    if (request.command === 'execute') {
      const plan = plans.at(-1)?.plan;
      if (!plan) {
        return {
          command: request,
          status: 'rejected',
          message: 'no plan to execute',
          snapshot: this.emptySnapshot(),
          artifacts: ['execute-missing-plan'],
          audits: [],
        };
      }

      const result = await this.deps.orchestrator.executeIncidentPlan(plan);
      const summary = summarizeRuns(result.runs);
      const event = buildSummaryEvent(incident.id, request.command, {
        routeId: plan.id,
        approved: result.approved,
        reasons: [`runs=${summary.total}`],
      });
      const audit = auditPlanDecision(plan, {
        command: request.command,
        incidentId: plan.incidentId,
        canAutoApprove: result.approved,
        reasons: [event.payload.reasons],
        at: new Date().toISOString(),
      });

      return {
        command: request,
        status: summary.failed > 0 ? 'queued' : 'done',
        message: `executed=${summary.total}`,
        snapshot: snapshotFromRuns(incident, result.runs),
        artifacts: [event.payload.routeId, ...result.runs.map((run) => run.id)],
        audits: [{
          command: request.command,
          incidentId: incident.id,
          status: summary.failed > 0 ? 'queued' : 'done',
          statusMessage: `runs=${summary.total}`,
          eventId,
        }, {
          command: request.command,
          incidentId: incident.id,
          status: audit.canAutoApprove ? 'accepted' : 'rejected',
          statusMessage: `auto=${audit.canAutoApprove}`,
          eventId,
        }],
      };
    }

    if (request.command === 'promote') {
      const plan = createPlan(incident, request.reason ?? request.correlationId);
      const canAdvance = canApprove(plan);

      return {
        command: request,
        status: canAdvance ? 'done' : 'rejected',
        message: canAdvance ? 'promoted' : 'promotion blocked',
        snapshot: {
          policyApproved: canAdvance,
          runCount: currentRuns.length,
          failedRunCount: currentRuns.filter((run) => run.state === 'failed').length,
          severityScore: buildSeveritySignal(incident).compositeScore,
        },
        artifacts: [String(plan.id)],
        audits: [{
          command: request.command,
          incidentId: incident.id,
          status: canAdvance ? 'done' : 'rejected',
          statusMessage: `approve=${canAdvance}`,
          eventId,
        }],
      };
    }

    const queryResult = await this.refreshState({
      tenantId: request.tenantId,
      unresolvedOnly: true,
      limit: 500,
    });

    return {
      command: request,
      status: 'done',
      message: `query results ${queryResult.length}`,
      snapshot: this.emptySnapshot(),
      artifacts: queryResult,
      audits: [{
        command: request.command,
        incidentId: incident.id,
        status: 'done',
        statusMessage: `query=${queryResult.length}`,
        eventId,
      }],
    };
  }

  summarizeCommands = (audits: readonly CommandAudit[]) => summarizeCommand(audits as any);

  private async refreshState(query: IncidentQuery): Promise<string[]> {
    const incidents = await this.deps.repository.findIncidents(query);
    const records = await Promise.all(incidents.data.map(async (incident) => {
      const plans = await this.deps.repository.findPlans(incident.id);
      const runCount = (await this.deps.repository.getRuns(incident.id)).length;
      return `${incident.id}|plans=${plans.length}|runs=${runCount}`;
    }));
    return records;
  }

  private emptySnapshot(): CommandCenterSnapshot {
    return {
      policyApproved: false,
      runCount: 0,
      failedRunCount: 0,
      severityScore: 0,
    };
  }
}
