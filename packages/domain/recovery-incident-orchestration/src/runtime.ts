import type {
  IncidentRecord,
  IncidentPlan,
  IncidentId,
  OrchestrationPlan,
  IncidentEvent,
  OrchestrationRun,
} from './types';
import { validateIncidentRecord, validatePlanRoute, validateRun } from './validators';
import { createPlan } from './planner';
import { incidentFromEnvelope, planToEvent } from './adapters';

export interface RunbookResult {
  readonly id: string;
  readonly planId: IncidentPlan['id'];
  readonly event: IncidentEvent;
  readonly run: OrchestrationRun;
}

export const bootPlanFromEnvelope = (payload: unknown, incidentId: IncidentId): OrchestrationPlan => {
  const envelope = payload as { id: IncidentId; source: string; incident: Record<string, unknown>; createdAt: string };
  const record = incidentFromEnvelope({
    ...envelope,
    id: incidentId,
  });

  const validated = validateIncidentRecord(record);
  if (!validated.valid) {
    throw new Error(`invalid incident ${incidentId}: ${validated.issues.join(',')}`);
  }

  return createPlan(record, `${String(incidentId)}-${Object.keys(envelope?.incident ?? {}).length}`);
};

export const simulateExecution = (incident: IncidentRecord, eventType: string): readonly RunbookResult[] => {
  const plan = createPlan(incident, eventType);
  const routeCheck = validatePlanRoute(plan.route, String(plan.id));
  if (!routeCheck.valid) {
    throw new Error(`invalid route ${routeCheck.issues.join(',')}`);
  }

  const now = new Date();
  const runs: OrchestrationRun[] = plan.route.nodes.map((node, index) => {
    let run: OrchestrationRun = {
      id: `${plan.id}:run-${index}` as OrchestrationRun['id'],
      planId: plan.id,
      nodeId: node.id,
      state: 'pending',
      startedAt: now.toISOString(),
      output: { nodeId: String(node.id), command: node.play.command },
    };

    if (!validateRun(run).valid) {
      run = {
        ...run,
        state: 'failed',
      };
    }

    return run;
  });

  return runs.map((run) => ({
    id: `${run.id}:result`,
    planId: run.planId,
    event: planToEvent(plan),
    run,
  }));
};

export const summarizeRuns = (runs: readonly OrchestrationRun[]): {
  readonly passed: number;
  readonly failed: number;
  readonly total: number;
} => {
  const failed = runs.reduce((count, run) => count + (run.state === 'failed' ? 1 : 0), 0);
  const passed = runs.reduce((count, run) => count + (run.state === 'done' ? 1 : 0), 0);
  return {
    passed,
    failed,
    total: runs.length,
  };
};
