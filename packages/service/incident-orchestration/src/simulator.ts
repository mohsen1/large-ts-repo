import { IncidentRecord } from '@domain/incident-management';
import { buildExecutionPlan, triageToDecision } from '@domain/incident-management';
import { EventEnvelope, InMemoryEventStore } from '@data/repositories';
import { buildResolutionRunbook } from '@domain/incident-management';

export interface SimulationResult {
  readonly step: number;
  readonly state: IncidentRecord['state'];
  readonly note: string;
  readonly elapsedSeconds: number;
  readonly confidence: number;
}

export interface SimulationSession {
  readonly incidentId: string;
  readonly tenantId: string;
  readonly state: IncidentRecord['state'];
  readonly runs: readonly SimulationResult[];
}

const seededRandom = (seed: string): number => {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) {
    h = (h << 5) - h + seed.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h % 1000) / 1000;
};

export const runRecoverySimulation = async (incident: IncidentRecord): Promise<SimulationSession> => {
  const eventStore = new InMemoryEventStore<string>();
  const runbook = buildResolutionRunbook(incident);
  const decision = triageToDecision(incident, [...runbook.tasks].map((_task, idx) => {
    return incident.runbook ?? {
      id: `${incident.id}-fallback-${idx}`,
      tenantId: incident.tenantId,
      name: `${incident.title}-${idx}`,
      owner: incident.id as any,
      appliesTo: [incident.triage.severity],
      steps: [],
      tags: ['fallback'],
    } as any;
  }));

  await eventStore.append({
    tenantId: incident.tenantId,
    kind: 'simulation.started',
    payload: JSON.stringify({
      incident: incident.id,
      decision: decision.state,
    }),
  });

  const runs: SimulationResult[] = [];
  const plan = buildExecutionPlan(runbook.tasks.map(() => incident.runbook!).filter(Boolean) as [], incident);
  const estimated = (plan?.estimatedMinutes ?? 1) * 60;
  const base = Number(estimated.toFixed(0));
  const progress = seededRandom(String(incident.id)) * 100;

  for (let step = 0; step < 8; step += 1) {
    const confidence = Number(((1 - step / 10) * (1 + progress / 100)).toFixed(4));
    const elapsedSeconds = Math.max(1, Math.round((base / 8) + step * 5 + progress));
    runs.push({
      step,
      state: step % 2 ? 'monitoring' : 'mitigating',
      note: `simulated control step ${step + 1} for ${incident.title}`,
      elapsedSeconds,
      confidence,
    });
  }

  await eventStore.append({
    tenantId: incident.tenantId,
    kind: 'simulation.finished',
    payload: JSON.stringify({
      incident: incident.id,
      steps: runs.length,
    }),
  });

  const latestResult = await eventStore.last(incident.tenantId);
  const latest = latestResult.ok ? latestResult.value : undefined;
  const finalState = latest ? latest.kind : incident.state;

  return {
    incidentId: incident.id,
    tenantId: incident.tenantId,
    state: finalState === 'simulation.finished' ? 'resolved' : incident.state,
    runs,
  };
};

export const summarizeSimulation = (session: SimulationSession): string => {
  const resolved = session.runs.filter((entry) => entry.confidence > 0.5).length;
  return `${session.incidentId} -> ${session.state} (${resolved}/${session.runs.length})`;
};

export type { EventEnvelope };
