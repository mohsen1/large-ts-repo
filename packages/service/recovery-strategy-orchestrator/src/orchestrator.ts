import type { Result } from '@shared/result';
import { buildWorkspaceFromTemplate, buildDraftFromTemplate, makeRunFromDraft } from './planner';
import type {
  OrchestrationWorkspace,
  StrategyOrchestratorConfig,
  OrchestrationSummary,
  StrategyOrchestrator,
} from './types';
import type { StrategyTemplate } from '@domain/recovery-orchestration-planning';

const ok = <T>(value: T): Result<T, string> => ({ ok: true, value });

export class RecoveryStrategyOrchestrator implements StrategyOrchestrator {
  private readonly tenantId: string;
  private readonly store: StrategyOrchestratorConfig['store'];

  constructor(config: StrategyOrchestratorConfig) {
    this.tenantId = config.tenantId;
    this.store = config.store;
  }

  async state(): Promise<OrchestrationSummary> {
    const plans = await this.store.listPlans({ tenantIds: [this.tenantId], includeCompleted: true });
    const runs = await this.store.metrics(this.tenantId);

    return {
      tenantId: this.tenantId,
      planCount: plans.length,
      runCount: runs.totalPlans,
      activePlanId: plans.at(-1)?.plan.strategyId ?? 'none',
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  async buildWorkspace(template: StrategyTemplate): Promise<Result<OrchestrationWorkspace, string>> {
    const built = await buildWorkspaceFromTemplate(this.store, this.tenantId, template);
    if (!built.ok) {
      return { ok: false, error: built.error };
    }

    const draft = buildDraftFromTemplate(this.tenantId, template);
    return ok({
      draft: {
        draftId: draft.draft.draftId,
        owner: draft.draft.owner,
        template,
        requestedAt: draft.draft.requestedAt,
        priority: draft.draft.priority,
        budgetMinutes: draft.draft.budgetMinutes,
        stepsWindow: draft.draft.stepsWindow,
      },
      plan: built.value.plan,
      run: built.value.run,
      windows: built.value.run.plan.windows,
      template,
    });
  }

  async startRun(template: StrategyTemplate): Promise<Result<OrchestrationWorkspace['run'], string>> {
    const workspace = await this.buildWorkspace(template);
    if (!workspace.ok) {
      return { ok: false, error: workspace.error };
    }
    const persisted = await this.store.upsertRun(this.tenantId, workspace.value.run);
    if (!persisted.ok) {
      return { ok: false, error: persisted.error };
    }
    return ok(workspace.value.run);
  }

  async appendCommand(planId: string, commandSummary: string): Promise<Result<void, string>> {
    return this.store.appendCommandLog(this.tenantId, planId, commandSummary);
  }
}

export const createRecoveryStrategyOrchestrator = (config: StrategyOrchestratorConfig): StrategyOrchestrator =>
  new RecoveryStrategyOrchestrator(config);
