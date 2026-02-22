import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';
import type { IncidentContext, RecoveryScenario, ScenarioFilter } from '@domain/recovery-scenario-engine';

export interface PersistedRunRecord {
  runId: string;
  scenarioId: string;
  incidentId: string;
  tenantId: string;
  startedAt: string;
  completedAt?: string;
  context: IncidentContext;
  state: string;
  snapshot: RecoveryScenario;
}

export interface ScenarioTimeline {
  scenario: RecoveryScenario;
  runs: readonly PersistedRunRecord[];
}

export class InMemoryScenarioStore {
  #scenarios: Map<string, RecoveryScenario>;
  #runs: Map<string, PersistedRunRecord>;

  constructor() {
    this.#scenarios = new Map();
    this.#runs = new Map();
  }

  upsertScenario(scenario: RecoveryScenario): void {
    this.#scenarios.set(scenario.id, scenario);
  }

  getScenario(id: string): RecoveryScenario | undefined {
    return this.#scenarios.get(id);
  }

  queryScenarios(filter: ScenarioFilter): RecoveryScenario[] {
    const all = [...this.#scenarios.values()];
    return all.filter((scenario) => {
      if (filter.tenantId && scenario.tenantId !== filter.tenantId) return false;
      if (filter.state && scenario.state !== filter.state) return false;
      if (filter.severities && !filter.severities.includes(scenario.severity)) return false;
      if (filter.tags && !filter.tags.every((tag: string) => scenario.tags.includes(tag))) return false;
      if (filter.changedSince && new Date(scenario.updatedAt) < new Date(filter.changedSince)) return false;
      return true;
    });
  }

  addRun(run: PersistedRunRecord): void {
    this.#runs.set(run.runId, run);
  }

  getRun(runId: string): PersistedRunRecord | undefined {
    return this.#runs.get(runId);
  }

  timelineForIncident(incidentId: string): ScenarioTimeline[] {
    const byScenario = new Map<string, PersistedRunRecord[]>();
    for (const run of this.#runs.values()) {
      if (run.incidentId !== incidentId) continue;
      const existing = byScenario.get(run.scenarioId) ?? [];
      byScenario.set(run.scenarioId, [...existing, run]);
    }

    return [...byScenario.entries()].map(([scenarioId, runs]) => {
      const scenario = this.#scenarios.get(scenarioId);
      if (!scenario) {
        return {
          scenario: null as unknown as RecoveryScenario,
          runs,
        };
      }
      return { scenario, runs };
    });
  }
}

export const findBestTimelineMatch = (store: InMemoryScenarioStore, incidentId: string): ScenarioTimeline | undefined => {
  const timelines = store.timelineForIncident(incidentId).sort((a, b) => b.runs.length - a.runs.length);
  return timelines[0];
};

const toFailure = <T>(error: string): Result<T, string> => fail(error);

export const runResult = <T>(value: T | undefined): Result<T, string> => {
  if (!value) return toFailure('run-not-found');
  return ok(value);
};
