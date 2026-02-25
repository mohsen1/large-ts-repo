import {
  type BlueprintTemplate,
  type PlaybookConstraint,
  type PlaybookAutomationRunId,
  type PlaybookAutomationSessionId,
  createPhaseSequence,
  policySignalFromTemplate,
  simulatePlan,
} from '@domain/recovery-playbook-orchestration-core';
import type { AuditQuery, AutomationJournal, JournalRecord, SessionSnapshot } from '@data/recovery-playbook-automation-store';
import { fail, ok, type Result } from '@shared/result';
import { withBrand } from '@shared/core';
import { AutomationScheduler } from './scheduler';
import { executeRuntime } from './runtime';

export interface AutomationSessionConfig {
  tenantId: string;
  preferredPhases?: readonly string[];
}

export interface SimulationSnapshot {
  tenantId: string;
  constraints: readonly PlaybookConstraint[];
  scenario: string;
}

export interface SessionDiagnostics {
  readonly runId: PlaybookAutomationRunId;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly score: number;
  readonly accepted: boolean;
}

export interface SessionManifest {
  readonly sessionId: PlaybookAutomationSessionId;
  readonly runs: readonly PlaybookAutomationRunId[];
}

const parseConstraintSeed = (constraints: readonly PlaybookConstraint[]): number =>
  constraints.reduce((acc, signal) => acc + signal.threshold, 0);

export interface PlaybookAutomationSessionState {
  readonly sessionId: PlaybookAutomationSessionId;
  readonly runs: readonly PlaybookAutomationRunId[];
}

export class PlaybookAutomationSession {
  private readonly scheduler = new AutomationScheduler();
  private readonly runs = new Map<PlaybookAutomationSessionId, PlaybookAutomationRunId[]>();
  private readonly diagnostics = new Map<PlaybookAutomationRunId, SessionDiagnostics>();

  private static runCounter = 0;

  private constructor(
    private readonly journal: AutomationJournal,
    private readonly config: AutomationSessionConfig,
    private readonly sessionId: PlaybookAutomationSessionId,
  ) {
    this.runs.set(this.sessionId, []);
  }

  private static nextRunId(tenantId: string): PlaybookAutomationRunId {
    PlaybookAutomationSession.runCounter += 1;
    return withBrand(`${tenantId}:run-${PlaybookAutomationSession.runCounter}`, 'PlaybookAutomationRunId');
  }

  static async create(
    journal: AutomationJournal,
    config: AutomationSessionConfig,
  ): Promise<Result<PlaybookAutomationSession, string>> {
    const sessionId = withBrand(`session-${config.tenantId}:${Date.now()}`, 'PlaybookAutomationSessionId');
    return ok(new PlaybookAutomationSession(journal, config, sessionId));
  }

  private asJournalRecord(
    input: Omit<JournalRecord, 'id'>,
    runId: PlaybookAutomationRunId,
  ): JournalRecord {
    return {
      ...input,
      id: withBrand(`${runId}:${Date.now()}`, 'PlaybookJournalRecordId'),
    };
  }

  get state(): PlaybookAutomationSessionState {
    return {
      sessionId: this.sessionId,
      runs: this.runs.get(this.sessionId) ?? [],
    };
  }

  async hydrate(
    template: BlueprintTemplate,
    constraints: readonly PlaybookConstraint[],
  ): Promise<Result<PlaybookAutomationRunId, string>> {
    const runId = PlaybookAutomationSession.nextRunId(this.config.tenantId);
    const runRuns = this.runs.get(this.sessionId);
    if (!runRuns) return fail('session-not-found');

    runRuns.push(runId);

    const seed = parseConstraintSeed(constraints);
    const plan = simulatePlan({ seed, constraints, signals: [policySignalFromTemplate(template, 'p1')] });
    const normalizedPhases = createPhaseSequence(plan.traces.map((trace) => trace.phase));

    this.scheduler.enqueue(this.sessionId, runId, async (_input) => {
      const simulation = {
        tenantId: this.config.tenantId,
        constraints,
        scenario: plan.runId,
      };

      const runtime = await executeRuntime({ tenantId: this.config.tenantId, runId }, simulation);
      if (!runtime.ok) return fail(runtime.error);

      const output: SessionDiagnostics = {
        runId,
        startedAt: new Date().toISOString(),
        score: runtime.value.score,
        accepted: runtime.value.score > 0.5,
      };
      this.diagnostics.set(runId, output);

      const record: Omit<JournalRecord, 'id'> = {
        tenantId: this.config.tenantId,
        runId,
        kind: output.accepted ? 'run-created' : 'run-finalized',
        at: new Date().toISOString(),
        actor: 'scheduler',
        payload: {
          reason: simulation.scenario,
          metadata: { normalizedPhases: normalizedPhases.join(',') },
          priority: Math.min(10, Math.max(1, seed / 10)),
        },
      };

      await this.journal.append(this.asJournalRecord(record, runId));
      return runtime;
    });

    return ok(runId);
  }

  async run(
    sessionId: PlaybookAutomationSessionId,
    runId: PlaybookAutomationRunId,
  ): Promise<Result<SessionDiagnostics, string>> {
    if (sessionId !== this.sessionId) return fail('session-run-mismatch');
    const result = await this.scheduler.runQueued(sessionId, runId, `tenant:${this.config.tenantId}`);
    if (!result.ok) return fail(result.error);

    const diagnostics = this.diagnostics.get(runId);
    if (!diagnostics) return fail('diagnostic-missing');
    return ok({ ...diagnostics, endedAt: new Date().toISOString() });
  }

  async snapshot(sessionId: PlaybookAutomationSessionId): Promise<Result<SessionSnapshot, string>> {
    if (sessionId !== this.sessionId) return fail('session-not-found');
    return this.journal.openSession(sessionId);
  }

  async history(query: AuditQuery): Promise<Result<readonly JournalRecord[], string>> {
    return this.journal.query({ ...query, tenantId: this.config.tenantId });
  }

  async close(sessionId: PlaybookAutomationSessionId): Promise<Result<SessionManifest, string>> {
    if (sessionId !== this.sessionId) return fail('session-not-found');
    const runs = this.runs.get(sessionId);
    if (!runs) return fail('session-not-found');
    this.runs.delete(sessionId);
    await this.journal.closeSession(sessionId);
    return ok({ sessionId, runs });
  }
}

export const runSimulationFromPlan = async (
  session: PlaybookAutomationSession,
  template: BlueprintTemplate,
): Promise<Result<PlaybookAutomationRunId, string>> => {
  const { sessionId, runs } = session.state;
  if (runs.length > 0) {
    const next = runs.at(-1)!;
    const executed = await session.run(sessionId, next);
    return executed.ok ? ok(next) : fail(executed.error);
  }

  const hydrated = await session.hydrate(template, template.constraints);
  if (!hydrated.ok) return fail(hydrated.error);

  const result = await session.run(sessionId, hydrated.value);
  if (!result.ok) return fail(result.error);
  return ok(hydrated.value);
};

export const launchSession = async (
  journal: AutomationJournal,
  config: AutomationSessionConfig,
): Promise<Result<PlaybookAutomationSession, string>> => PlaybookAutomationSession.create(journal, config);

export const runSimulation = async (snapshot: SimulationSnapshot): Promise<string> => {
  const sequence = createPhaseSequence(['initialized', 'simulated', 'audited', 'finished']);
  await Promise.all(sequence.map(async (phase) => Promise.resolve(phase)));
  return `${snapshot.tenantId}:${snapshot.scenario}:${sequence.length}`;
};
