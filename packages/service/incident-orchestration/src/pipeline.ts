import { IncidentRecord, EscalationPolicy, buildExecutionPlan, triageToDecision, TriageDecision } from '@domain/incident-management';
import { IncidentRepository } from '@data/incident-hub/store';
import { summarizeBatchRisk } from './insights';
import { runRecoverySimulation, summarizeSimulation } from './simulator';
import { InMemoryEventStore } from '@data/repositories';
import { ok, fail, Result } from '@shared/result';

export interface PipelineContext {
  readonly repository: IncidentRepository;
  readonly maxParallel: number;
  readonly tenant: string;
}

export interface PipelineResult {
  readonly incident: IncidentRecord;
  readonly policy: EscalationPolicy;
  readonly decision: TriageDecision;
  readonly sessionSummary: string;
  readonly riskProfile: ReturnType<typeof summarizeBatchRisk>;
}

const normalizeParallelism = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(16, Math.floor(value)));
};

export const createOrchestrationPipeline = (input: PipelineContext) => {
  const parallelism = normalizeParallelism(input.maxParallel);
  const eventStore = new InMemoryEventStore<string>();

  const applyDecision = async (incident: IncidentRecord, decision: TriageDecision): Promise<Result<IncidentRecord>> => {
    const saved = await input.repository.upsert({
      ...incident,
      state: decision.state,
      currentStep: decision.selectedRunbook ?? incident.currentStep,
      updatedAt: new Date().toISOString(),
    });
    return saved.ok ? ok(saved.value) : fail(saved.error);
  };

  const run = async (incident: IncidentRecord): Promise<Result<PipelineResult>> => {
    const templates = decisionTemplates(incident);
    const decision = triageToDecision(incident, templates);
    const plan = buildExecutionPlan(templates, incident);
    const policy: EscalationPolicy = {
      id: `${incident.id}-policy` as any,
      name: 'orchestration-pipeline',
      severityThreshold: incident.triage.severity,
      maxMinutesToAction: plan ? Math.ceil(plan.estimatedMinutes) : 20,
      notifyOnFailure: true,
    };

    const applied = await applyDecision(incident, decision);
    if (!applied.ok) return fail(applied.error);

    const riskProfile = summarizeBatchRisk([applied.value]);
    const simulation = await runRecoverySimulation(applied.value);
    const sessionSummary = summarizeSimulation(simulation);

    await eventStore.append({
      tenantId: input.tenant,
      kind: 'pipeline.executed',
      payload: JSON.stringify({
        incidentId: applied.value.id,
        decision: decision.state,
        confidence: decision.selectedRunbook ? 'with-plan' : 'without-plan',
      }),
    });

    return ok({
      incident: applied.value,
      policy,
      decision,
      sessionSummary,
      riskProfile,
    });
  };

  return {
    run,
    parallelism,
  };
};

const decisionTemplates = (incident: IncidentRecord) => {
  return incident.runbook
    ? [incident.runbook]
    : [
        {
          id: `${incident.id}-default-${incident.triage.severity}`,
          tenantId: incident.tenantId,
          name: `fallback-${incident.id}`,
          owner: incident.id as any,
          appliesTo: [incident.triage.severity],
          steps: [],
          tags: ['fallback'],
        } as any,
      ];
};
