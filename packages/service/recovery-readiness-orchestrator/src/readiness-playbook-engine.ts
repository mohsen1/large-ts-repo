import type {
  PlaybookDefinition,
  PlaybookSignal,
  ReadinessPriority,
  ReadinessRun,
  ReadinessRunEnvelope,
  ReadinessPlaybookTemplate,
} from '@domain/recovery-readiness/playbook-models';
import {
  evaluatePlaybookPolicy,
  pickPlaybook,
  type PlaybookEvaluationResult,
} from '@domain/recovery-readiness/playbook-policy';
import {
  evaluateSchedule,
  describeSchedule,
} from '@domain/recovery-readiness/playbook-schedule';
import { createLifecycleEvent, toEventEnvelope } from '@domain/recovery-readiness/playbook-events';
import { getPlaybookRepository, mapWindowFromTemplate, seedWithFixture, type PlaybookRepository } from '@data/recovery-readiness-store';
import type { Result } from '@shared/result';
import { fail, ok } from '@shared/result';

export interface ReadinessPlaybookCandidate {
  playbook: PlaybookDefinition;
  result: PlaybookEvaluationResult;
}

export interface RunIntake {
  playbook: PlaybookDefinition;
  triggeringSignals: PlaybookSignal[];
  requestedBy: string;
  priority: ReadinessPriority;
  requestedAt: string;
  allowedCategories?: ReadonlyArray<PlaybookDefinition['category']>;
}

export interface OrchestratorDecision {
  playbookId: string;
  accepted: boolean;
  reasons: string[];
  schedule: ReturnType<typeof evaluateSchedule>;
  confidence: number;
}

export interface OrchestratorRunRequest {
  run: ReadinessRun;
  candidate: ReadinessPlaybookCandidate;
}

export interface ReadinessPlaybookOrchestrator {
  proposeCandidates(input: RunIntake): Promise<ReadinessPlaybookCandidate[]>;
  scheduleRun(input: OrchestratorRunRequest): Promise<Result<OrchestratorDecision, Error>>;
  bootstrap(playbooks: PlaybookDefinition[]): Promise<Result<void, Error>>;
  toRunEnvelope(run: ReadinessRun, template: ReadinessPlaybookTemplate): ReadinessRunEnvelope;
}

const defaultStatus: ReadinessRun['status'] = 'queued';

export class RecoveryPlaybookEngine implements ReadinessPlaybookOrchestrator {
  public constructor(private readonly repository: PlaybookRepository = getPlaybookRepository()) {}

  async proposeCandidates(input: RunIntake): Promise<ReadinessPlaybookCandidate[]> {
    const allPlaybooks = await this.loadPlaybooksFromRepository(input.allowedCategories);
    const policyInput = {
      signals: input.triggeringSignals,
      priorities: new Set<ReadinessPriority>([input.priority, 'critical', 'high']),
      allowedCategories: new Set<PlaybookDefinition['category']>(input.allowedCategories ?? ['customer-impact', 'infrastructure']),
    };

    const evaluations = pickPlaybook(policyInput, allPlaybooks)
      .map((result): ReadinessPlaybookCandidate => ({
        playbook: allPlaybooks.find((playbook) => playbook.id === result.playbookId)!,
        result,
      }))
      .filter((candidate) => candidate.result.recommendedSignals.length > 0 && candidate.result.matched);

    return evaluations.slice(0, 5);
  }

  async scheduleRun(input: OrchestratorRunRequest): Promise<Result<OrchestratorDecision, Error>> {
    const playbook = input.candidate.playbook;
    const template: ReadinessPlaybookTemplate = {
      id: `${playbook.id}-template`,
      title: `${playbook.name} runtime template`,
      definition: mapWindowFromTemplate({
        id: `${playbook.id}-template`,
        title: `${playbook.name} runtime template`,
        definition: {
          horizonHours: Math.max(1, playbook.steps.length),
          refreshCadenceMinutes: 30,
          maxConcurrency: Math.max(1, playbook.steps.length),
          allowParallelRun: true,
          blackoutWindows: [],
        },
        playbook,
      }),
      playbook,
    };

    const schedule = evaluateSchedule({
      window: template.definition,
      playbook,
      priority: input.run.priority,
      requestedAt: input.run.startedAt,
    });

    const envelope = this.toRunEnvelope(
      {
        ...input.run,
        status: defaultStatus,
        riskScore: Math.min(1, input.candidate.result.confidence + 0.1),
      },
      template,
    );

    const saveResult = await this.repository.upsertPlaybook({
      playbook: template,
      runEnvelope: envelope,
      planWindow: template.definition,
    });

    if (!saveResult.ok) {
      return fail(saveResult.error, 'playbook_orchestrator_store_failed');
    }

    return ok({
      playbookId: playbook.id,
      accepted: true,
      reasons: [...input.candidate.result.reasons, describeSchedule(schedule)],
      schedule,
      confidence: input.candidate.result.confidence,
    });
  }

  async bootstrap(playbooks: PlaybookDefinition[]): Promise<Result<void, Error>> {
    return seedWithFixture(playbooks);
  }

  toRunEnvelope(run: ReadinessRun, template: ReadinessPlaybookTemplate): ReadinessRunEnvelope {
    const lifecycle = createLifecycleEvent({
      eventId: `${run.id}-created`,
      run,
      lifecycle: 'created',
      actor: 'system',
      reason: 'Run envelope prepared by orchestrator',
    });

    const eventEnvelope = toEventEnvelope(lifecycle, run.id);

    return {
      run,
      template,
      context: {
        source: 'recovery-readiness-orchestrator',
        planWindowHours: template.definition.horizonHours,
        scheduleHint: describeSchedule(
          evaluateSchedule({
            window: template.definition,
            playbook: template.playbook,
            priority: run.priority,
            requestedAt: run.startedAt,
          }),
        ),
        lifecycleType: eventEnvelope.metadata?.eventType ?? lifecycle.type,
      },
    };
  }

  private async loadPlaybooksFromRepository(categories?: ReadonlyArray<PlaybookDefinition['category']>) {
    const playbookResult = await this.repository.queryPlaybooks({
      playbookNameContains: undefined,
      includeDraft: true,
    });

    if (!playbookResult.ok) return [];

    const templates = playbookResult.value;
    const byCategory = new Set(categories ?? []);

    if (byCategory.size === 0) {
      return templates.map((entry) => entry.playbook);
    }

    return templates.filter((entry) => byCategory.has(entry.playbook.category)).map((entry) => entry.playbook);
  }
}

export const createRecoveryPlaybookEngine = (): ReadinessPlaybookOrchestrator =>
  new RecoveryPlaybookEngine();
