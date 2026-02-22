import { InMemoryRecoveryPlaybookRepository, type PlaybookQueryCursor } from '@data/recovery-playbook-store';
import {
  PlaybookExecutionSession,
  RecoveryPlaybookCatalog,
  PlaybookSelectionEngine,
} from '@service/recovery-playbook-engine';
import type { RecoveryPlanExecution, RecoveryPlaybookContext } from '@domain/recovery-playbooks';
import { fail, ok, type Result } from '@shared/result';
import { parsePlaybookCommand, type PlaybookCommand } from './commands';
import { describePlaybooks, type PlaybookManifest } from './viewer';

export interface RunnerDeps {
  repository?: InMemoryRecoveryPlaybookRepository;
}

export class RecoveryPlaybookRunner {
  private readonly repository: InMemoryRecoveryPlaybookRepository;
  private readonly catalog: RecoveryPlaybookCatalog;
  private readonly session: PlaybookExecutionSession;

  constructor(deps: RunnerDeps = {}) {
    this.repository = deps.repository ?? new InMemoryRecoveryPlaybookRepository();
    this.catalog = new RecoveryPlaybookCatalog(this.repository);
    const engine = new PlaybookSelectionEngine(this.catalog);
    this.session = new PlaybookExecutionSession(engine, this.catalog);
  }

  async run(payload: unknown): Promise<Result<PlaybookManifest, string>> {
    const parsed = this.parse(payload);
    if (!parsed.ok) return fail(parsed.error.message);

    if (parsed.value.type === 'prepare') {
      return this.prepare(parsed.value);
    }

    const run = this.session.getRun(parsed.value.runId);
    if (!run) return fail('run-not-found');
    await this.session.finishRun(run.id, parsed.value.status);
    return ok(describeRun(run));
  }

  private parse(payload: unknown): Result<PlaybookCommand, Error> {
    try {
      return ok(parsePlaybookCommand(payload));
    } catch (error) {
      return fail(error instanceof Error ? error : new Error('invalid command'));
    }
  }

  private async prepare(command: Extract<PlaybookCommand, { type: 'prepare' }>): Promise<Result<PlaybookManifest, string>> {
    const context: RecoveryPlaybookContext = RecoveryPlaybookRunner.toContext(command);
    const runResult = await this.session.prepareRun(command.tenantId, context);

    if (!runResult.ok) return fail(runResult.error);
    const manifest = describePlaybooks([runResult.value]);
    return ok({
      ...manifest,
      nextCursor: '' as PlaybookQueryCursor,
      total: manifest.items.length,
    });
  }

  private static toContext(command: Extract<PlaybookCommand, { type: 'prepare' }>): RecoveryPlaybookContext {
    return {
      tenantId: command.tenantId,
      serviceId: command.serviceId,
      incidentType: command.incidentType,
      affectedRegions: command.affectedRegions,
      triggeredBy: command.requestedBy,
    };
  }
}

const describeRun = (run: RecoveryPlanExecution): PlaybookManifest => ({
  items: [
    {
      id: run.id,
      status: run.status,
      operator: run.operator,
      steps: run.selectedStepIds.length,
      startedAt: run.startedAt,
    },
  ],
  nextCursor: '' as PlaybookQueryCursor,
  total: 1,
});
