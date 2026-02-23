import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import {
  CadenceExecutionEvent,
  CadenceIntent,
  CadencePlan,
  CadenceWindow,
  CadenceWindowForecast,
  buildForecast,
  summarizePlan,
} from '@domain/recovery-cadence-orchestration';
import type {
  CadenceCoordinatorConfig,
  CadenceCoordinatorError,
  CadenceCommandResult,
  CadenceOrchestratorDiagnostics,
  CadenceRun,
} from './types';
import type {
  CadenceEventPublisher,
  CadencePlanBuilder,
  CadenceIntentProcessor,
  CadenceForecastEngine,
  CadenceLifecycle,
  WindowBlueprint,
} from './ports';
import { buildPlanArtifacts, validateCoordinatorConfig } from './planner';
import { CadenceMemoryRepository } from '@data/recovery-cadence-event-store';

export class RecoveryCadenceCoordinator
  implements CadenceLifecycle, CadencePlanBuilder, CadenceIntentProcessor, CadenceForecastEngine
{
  private readonly repository = new CadenceMemoryRepository();
  private readonly activePlanIds = new Set<string>();

  constructor(
    private readonly config: CadenceCoordinatorConfig,
    private readonly publisher: CadenceEventPublisher,
  ) {}

  async craftPlan(rawConfig: CadenceCoordinatorConfig): Promise<Result<CadencePlan, CadenceCoordinatorError>> {
    const validated = validateCoordinatorConfig(rawConfig);
    if (!validated.ok) {
      return fail(validated.error);
    }

    const artifacts = buildPlanArtifacts(validated.value);
    if (!artifacts.ok) {
      return fail(artifacts.error);
    }

    for (const window of artifacts.value.windows) {
      await this.repository.saveWindow(window);
    }

    return this.persistPlan(artifacts.value.plan);
  }

  async persistPlan(plan: CadencePlan): Promise<Result<CadencePlan, CadenceCoordinatorError>> {
    const persisted = await this.repository.savePlan(plan);
    if (!persisted.ok) {
      return fail({ code: 'persist', message: 'Failed to persist plan', details: persisted.error });
    }
    return ok(persisted.value);
  }

  async expandPlan(
    planId: CadencePlan['id'],
    windows: readonly Omit<WindowBlueprint, 'id' | 'createdAt' | 'updatedAt'>[],
  ): Promise<Result<readonly CadenceWindow[], CadenceCoordinatorError>> {
    const planResult = await this.repository.getPlan(planId);
    if (!planResult.ok || !planResult.value) {
      return fail({ code: 'not-found', message: `Plan not found: ${planId}` });
    }

    const plan = planResult.value.plan;
    const expanded = windows.map<CadenceWindow>((raw, index) => ({
      id: `${planId}::expanded-${index}` as CadenceWindow['id'],
      planId,
      channel: raw.channel,
      name: raw.name,
      owner: raw.owner,
      startAt: raw.startAt,
      endAt: raw.endAt,
      leadMinutes: raw.leadMinutes,
      lagMinutes: raw.lagMinutes,
      intensity: index % 2 === 0 ? 'medium' : 'high',
      state: 'queued',
      risk: index % 2 === 0 ? 'minimal' : 'elevated',
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const next = [...plan.windows, ...expanded];
    await this.repository.savePlan({ ...plan, windows: next, updatedAt: new Date().toISOString() });
    for (const window of expanded) {
      await this.repository.saveWindow(window);
    }

    return ok(expanded);
  }

  async collectIntents(planId: CadencePlan['id']): Promise<Result<readonly CadenceIntent[], CadenceCoordinatorError>> {
    const planResult = await this.repository.getPlan(planId);
    if (!planResult.ok) {
      return fail({ code: 'persist', message: `Could not read plan: ${planId}` });
    }
    if (!planResult.value) {
      return fail({ code: 'not-found', message: `Plan not found: ${planId}` });
    }
    return ok(planResult.value.intents);
  }

  async applyIntents(planId: CadencePlan['id'], intents: readonly CadenceIntent[]): Promise<Result<readonly CadenceIntent[], CadenceCoordinatorError>> {
    const planResult = await this.repository.getPlan(planId);
    if (!planResult.ok || !planResult.value) {
      return fail({ code: 'not-found', message: `Plan not found: ${planId}` });
    }

    for (const intent of intents) {
      await this.repository.saveIntent({ ...intent, planId });
    }

    return ok(intents);
  }

  async forecast(plan: CadencePlan): Promise<Result<readonly CadenceWindowForecast[], CadenceCoordinatorError>> {
    const planRecord = await this.repository.getPlan(plan.id);
    if (!planRecord.ok || !planRecord.value) {
      return fail({ code: 'not-found', message: `Plan not found: ${plan.id}` });
    }

    const timeline = buildForecast(plan, planRecord.value.constraints);
    return ok(timeline.points);
  }

  async diagnose(plan: CadencePlan): Promise<Result<CadenceOrchestratorDiagnostics, CadenceCoordinatorError>> {
    const snapshot = summarizePlan(plan, []);
    return ok({
      queueDepth: snapshot.activeWindowCount,
      canAcceptMore: snapshot.activeWindowCount < this.config.maxActiveWindowCount,
      activeRuns: this.activePlanIds.size,
    });
  }

  async bootstrap(planId: CadencePlan['id']): Promise<Result<CadenceCommandResult, CadenceCoordinatorError>> {
    const planResult = await this.repository.getPlan(planId);
    if (!planResult.ok || !planResult.value) {
      return fail({ code: 'not-found', message: `Plan not found: ${planId}` });
    }

    const plan = planResult.value.plan;
    if (this.activePlanIds.has(planId) && this.activePlanIds.size >= this.config.maxActiveWindowCount) {
      return fail({ code: 'saturation', message: 'Coordinator reached max active plans' });
    }

    this.activePlanIds.add(planId);
    const event: CadenceExecutionEvent = {
      id: `event-${planId}-${Date.now()}` as CadenceExecutionEvent['id'],
      planId,
      windowId: plan.windows[0]?.id ?? ('fallback' as CadenceWindow['id']),
      kind: 'activated',
      timestamp: new Date().toISOString(),
      detail: `Plan ${planId} activated for ${plan.owner}`,
    };

    await this.repository.appendEvent(event);
    await this.publisher.publish('cadence.bootstrap', event);

    return ok({
      planId,
      cadenceId: plan.templateId,
      accepted: true,
      warnings: [],
      startedAt: new Date().toISOString(),
    });
  }

  async activateWindows(
    planId: CadencePlan['id'],
    windowIds: readonly CadenceWindow['id'][],
  ): Promise<Result<readonly CadenceWindow[], CadenceCoordinatorError>> {
    const planResult = await this.repository.getPlan(planId);
    if (!planResult.ok || !planResult.value) {
      return fail({ code: 'not-found', message: `Plan not found: ${planId}` });
    }

    const nextWindows: CadenceWindow[] = planResult.value.windows.map((window) => {
      if (!windowIds.includes(window.id)) {
        return window;
      }
      return {
        ...window,
        state: 'active',
        updatedAt: new Date().toISOString(),
      } as CadenceWindow;
    });

    const plan = planResult.value.plan;
    await this.repository.savePlan({ ...plan, windows: nextWindows, updatedAt: new Date().toISOString() });
    for (const window of nextWindows) {
      await this.repository.saveWindow(window);
    }

    return ok(nextWindows.filter((window) => windowIds.includes(window.id)));
  }

  async decommission(planId: CadencePlan['id']): Promise<Result<CadenceCommandResult, CadenceCoordinatorError>> {
    this.activePlanIds.delete(planId);
    const planResult = await this.repository.getPlan(planId);
    if (!planResult.ok) {
      return fail({ code: 'persist', message: `Unable to complete decommission: ${planId}` });
    }
    if (!planResult.value) {
      return fail({ code: 'not-found', message: `Plan not found: ${planId}` });
    }

    const plan = planResult.value.plan;
    const nextWindows: CadenceWindow[] = plan.windows.map((window) =>
      window.state === 'active' || window.state === 'queued'
        ? ({ ...window, state: 'terminated', updatedAt: new Date().toISOString() } as CadenceWindow)
        : window,
    );

    await this.repository.savePlan({ ...plan, windows: nextWindows, updatedAt: new Date().toISOString() });
    for (const window of nextWindows) {
      await this.repository.saveWindow(window);
    }

    await this.publisher.publish('cadence.decommission', { planId, terminatedAt: new Date().toISOString() });

    return ok({
      planId,
      cadenceId: plan.templateId,
      accepted: true,
      warnings: [],
      startedAt: new Date().toISOString(),
    });
  }

  async fetchRun(planId: CadencePlan['id']): Promise<Result<CadenceRun | undefined, CadenceCoordinatorError>> {
    const planRecord = await this.repository.getPlan(planId);
    if (!planRecord.ok) {
      return fail({ code: 'persist', message: `Plan fetch failed: ${planId}` });
    }
    if (!planRecord.value) {
      return ok(undefined);
    }

    const plan = planRecord.value.plan;
    const forecasts = await this.forecast(plan);
    if (!forecasts.ok) {
      return fail(forecasts.error);
    }

    return ok({
      planId,
      windows: planRecord.value.windows,
      intents: planRecord.value.intents,
      forecasts: forecasts.value,
      active: this.activePlanIds.has(planId),
    });
  }
}

export const createRecoveryCadenceCoordinator = (config: CadenceCoordinatorConfig): RecoveryCadenceCoordinator => {
  const publisher: CadenceEventPublisher = {
    publish: async () => undefined,
  };
  return new RecoveryCadenceCoordinator(config, publisher);
};
