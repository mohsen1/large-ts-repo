import { MessageBus } from '@platform/messaging';
import { ok, fail, Result } from '@shared/result';
import { createEnvelope } from '@shared/protocol';
import {
  IncidentRecord,
  buildExecutionPlan,
  triageToDecision,
  TriageDecision,
  IncidentAuditEvent,
  incidentAgeMinutes,
} from '@domain/incident-management';
import { IncidentRepository } from '@data/incident-hub/store';
import { InMemoryIncidentStore } from '@data/incident-hub';
import { collectMetrics, IncidentMetricsSink, NoopIncidentMetricsSink } from '@data/incident-hub/telemetry';
import { IncidentPublisher, createPublisher } from '@infrastructure/incident-notifications';
import { publishDecision } from './adapters';
import { selectTemplatesFor, templateToRunbook } from './planner';
import { createOrchestrationPipeline } from './pipeline';
import { InMemoryEventStore } from '@data/repositories';
import { evaluateIncidentRisk, summarizeBatchRisk } from './insights';

export interface IncidentOrchestratorInput {
  bus: MessageBus;
  repo: IncidentRepository;
  publisher?: IncidentPublisher;
  metrics?: IncidentMetricsSink;
}

export interface OrchestratedIncident {
  incident: IncidentRecord;
  planState: { hasRunbook: boolean; state: string };
  decision: TriageDecision;
}

const toAudit = (incident: IncidentRecord, decision: TriageDecision): IncidentAuditEvent => ({
  incidentId: incident.id,
  actor: 'system',
  action: decision.state,
  details: decision.note,
  occurredAt: new Date().toISOString(),
});

export const createOrchestrator = (input: IncidentOrchestratorInput) => {
  const metricsSink = input.metrics ?? new NoopIncidentMetricsSink();
  const publisher = input.publisher ?? createPublisher();
  const eventStore = new InMemoryEventStore<string>();
  const pipeline = createOrchestrationPipeline({
    repository: input.repo,
    maxParallel: 2,
    tenant: 'global',
  });

  return async (incident: IncidentRecord): Promise<Result<OrchestratedIncident>> => {
    try {
      const templates = selectTemplatesFor(incident);
      const runbooks = templates.map((template) => templateToRunbook(incident.tenantId, template));
      const plan = buildExecutionPlan(runbooks, incident);
      const decision = triageToDecision(incident, runbooks);
      const newState: IncidentRecord = {
        ...incident,
        state: plan ? 'mitigating' : 'triaged',
        runbook: plan?.runbook,
        updatedAt: new Date().toISOString(),
      };

      const saved = await input.repo.upsert(newState);
      if (!saved.ok) {
        return fail(saved.error as Error);
      }

      await input.bus.publish(
        'incident.orchestration.events' as any,
        createEnvelope('incident.orchestration.updated', {
          incident: saved.value,
          decision,
          ageMinutes: incidentAgeMinutes(saved.value),
          action: plan ? 'runbook-planned' : 'manual-review',
        }) as any,
      );

      await publishDecision(publisher, saved.value, decision.state, decision.note);
      await input.bus.subscribe({ topic: 'incident.audit'.replace('.', '-') as any, group: 'incident.service' as any }, async () => Promise.resolve());

      await metricsSink.emit(collectMetrics([saved.value]));

      const risk = evaluateIncidentRisk(saved.value);
      const summary = summarizeBatchRisk([saved.value]);
      await eventStore.append({
        tenantId: saved.value.tenantId,
        kind: 'orchestrator.risk',
        payload: JSON.stringify({ incidentId: saved.value.id, riskScore: risk.riskScore, tenantAverage: summary.avgRisk }),
      });
      await pipeline.run(saved.value);

      const audited = createEnvelope('incident.orchestration.audit', toAudit(saved.value, decision)) as any;
      await input.bus.publish('incident.orchestration.audit-events' as any, audited);

      return ok({
        incident: saved.value,
        planState: {
          hasRunbook: Boolean(plan),
          state: plan ? 'planned' : 'manual',
        },
        decision,
      });
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('orchestrator failure'));
    }
  };
};

export const bootstrap = (): IncidentOrchestratorInput => {
  const store = new InMemoryIncidentStore();
  return {
    bus: { publish: async () => Promise.resolve(), subscribe: async () => ({ topic: 'local' as any, close: async () => Promise.resolve() }) },
    repo: store,
  };
};
