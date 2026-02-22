import {
  type IncidentRecord,
  type IncidentPlan,
} from '@domain/recovery-incident-orchestration';

export interface CadencePolicy {
  readonly everyMinutes: number;
  readonly dryRunOnly: boolean;
  readonly retries: number;
}

export interface ScheduledRun {
  readonly runAt: string;
  readonly incidentId: IncidentRecord['id'];
  readonly command: string;
  readonly planId: IncidentPlan['id'];
}

export const defaultCadence: CadencePolicy = {
  everyMinutes: 5,
  dryRunOnly: true,
  retries: 2,
};

export const buildCadence = (base: string, policy: CadencePolicy): string[] => {
  const at = Date.parse(base);
  if (Number.isNaN(at)) {
    return [];
  }
  const schedule: string[] = [];
  for (let offset = 0; offset < policy.retries; offset += 1) {
    schedule.push(new Date(at + offset * policy.everyMinutes * 60_000).toISOString());
  }
  return schedule;
};

export const buildScheduledRuns = (incident: IncidentRecord, plan: IncidentPlan, policy: Partial<CadencePolicy> = {}): ScheduledRun[] => {
  const options: CadencePolicy = {
    ...defaultCadence,
    ...policy,
  };
  const anchors = buildCadence(new Date().toISOString(), options);

  return anchors.map((runAt, index) => ({
    runAt,
    incidentId: incident.id,
    command: index === 0 ? 'triage' : index === 1 ? 'stabilize' : 'close',
    planId: plan.id,
  }));
};

export const hasScheduledRuns = (runs: readonly ScheduledRun[]): boolean => {
  return runs.some((run) => Date.parse(run.runAt) > Date.now());
};
