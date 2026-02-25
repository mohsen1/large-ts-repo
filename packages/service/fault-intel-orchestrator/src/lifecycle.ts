import { createSharedRegistry, type PluginInvocation } from '@shared/fault-intel-runtime';
import type { PluginContext, CampaignExecutionContext } from '@domain/fault-intel-orchestration';
import { createFaultIntelStore } from '@data/fault-intel-store';

export type LifecycleStage = 'boot' | 'running' | 'finalizing' | 'finished' | 'errored';

export interface CampaignLifecycleHandle {
  readonly stage: LifecycleStage;
  readonly planId: string;
  readonly startedAt: string;
  readonly diagnostics: ReadonlyArray<PluginInvocation<PluginContext, unknown, unknown>>;
  readonly finish: () => Promise<void>;
}

export interface CampaignLifecycleConfig {
  readonly planId: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly campaignId: string;
}

export const createLifecycle = (context: CampaignLifecycleConfig): CampaignLifecycleHandle => {
  const store = createFaultIntelStore();
  const registry = createSharedRegistry<PluginContext>();
  const startedAt = new Date().toISOString();
  const diagnostics: PluginInvocation<PluginContext, unknown, unknown>[] = [];
  const traceScope = registry.scope('bootstrap', `bootstrap:${context.planId}`);

  const contextObj: PluginContext = {
    tenantId: context.tenantId,
    namespace: 'fault-intel-lifecycle',
    tags: new Set(['lifecycle', context.planId]),
    timestamp: startedAt,
  };

  const executionContext: CampaignExecutionContext = {
    campaignId: context.campaignId as CampaignExecutionContext['campaignId'],
    tenantId: context.tenantId as CampaignExecutionContext['tenantId'],
    workspaceId: context.workspaceId as CampaignExecutionContext['workspaceId'],
    planId: context.planId as CampaignExecutionContext['planId'],
    operatorId: 'system' as CampaignExecutionContext['operatorId'],
    startedAt,
    traceId: `${context.planId}::trace` as CampaignExecutionContext['traceId'],
  };

  void executionContext;
  void contextObj;

  const finish = async (): Promise<void> => {
    if ('[Symbol.asyncDispose]' in traceScope) {
      await traceScope[Symbol.asyncDispose]();
    }
    await store.summarize(context.tenantId as never, context.workspaceId as never);
  };

  return {
    planId: context.planId,
    startedAt,
    stage: 'boot',
    diagnostics,
    finish,
  };
};
