import { z } from 'zod';

import { parseDrillContext, parseDrillTemplate } from '@domain/recovery-drill/src/schema';
import { buildPlan } from './planner';
import { RecoveryDrillExecutor } from './execution';
import { fromTemplate, buildRunRecord, isActive } from '@data/recovery-drill-store/src/adapter';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { DrillStoreQuery } from '@data/recovery-drill-store/src';
import type { DrillDependencies, DrillProgressEvent, DrillStartInput } from './types';
import type { DrillRunPlan } from './types';
import type { RecoveryDrillTenantId, DrillMode } from '@domain/recovery-drill/src';
import { buildPolicyDecisions, buildRunTemplateHints } from './governance';
import { safeParseTenant } from './adapters';
import { buildServiceOverview } from './metrics';

const runIdSchema = z.string().min(1);

export class RecoveryDrillOrchestrator {
  constructor(private readonly dependencies: DrillDependencies) {}

  async onboardTemplate(value: unknown): Promise<{ templateId: string }> {
    const template = parseDrillTemplate(value);
    const record = fromTemplate(template);
    await this.dependencies.templates.upsertTemplate(record);
    return { templateId: template.id };
  }

  async plan(templateId: string): Promise<DrillRunPlan | undefined> {
    const templateRecord = await this.dependencies.templates.getTemplate(templateId as any);
    if (!templateRecord) return undefined;

    const context = parseDrillContext({
      runId: `${templateRecord.template.id}-${Date.now()}`,
      templateId: templateRecord.template.id,
      runAt: new Date().toISOString(),
      initiatedBy: templateRecord.template.createdBy,
      mode: templateRecord.template.mode,
      approvals: templateRecord.template.defaultApprovals,
    });

    const active = await this.dependencies.runs.listRuns({
      tenant: templateRecord.tenantId,
      status: ['queued', 'running', 'paused'],
    } as DrillStoreQuery);

    return buildPlan({
      context,
      template: templateRecord.template,
      activeRuns: active.items.length,
    });
  }

  async start(input: DrillStartInput): Promise<Result<DrillProgressEvent['status'], Error>> {
    const templateRecord = await this.dependencies.templates.getTemplate(input.templateId);
    if (!templateRecord) return fail(new Error('template-missing'));

    const context = parseDrillContext({
      runId: `${input.templateId}-run-${Date.now()}`,
      templateId: input.templateId,
      runAt: input.runAt ?? new Date().toISOString(),
      initiatedBy: input.initiatedBy,
      mode: (input.mode ?? templateRecord.template.mode) as DrillMode,
      approvals: input.approvals ?? templateRecord.template.defaultApprovals,
    });

    const existing = await this.dependencies.runs.getRun(context.runId);
    if (existing) return fail(new Error('run-id-collision'));

    const activeQuery: DrillStoreQuery = {
      tenant: templateRecord.tenantId,
      status: ['running', 'queued', 'paused'],
    };

    const activeRuns = await this.dependencies.runs.listRuns(activeQuery);
    const plan = buildPlan({ context, template: templateRecord.template, activeRuns: activeRuns.items.length });

    const seedRun = buildRunRecord(templateRecord.template, context, 'queued');
    await this.dependencies.runs.upsertRun(seedRun);

    await this.dependencies.notifier.publish({
      runId: context.runId,
      status: 'queued',
      at: new Date().toISOString(),
      details: `queued:${plan.scenarioOrder.length}`,
    });

    const governance = await buildPolicyDecisions(
      {
        templates: this.dependencies.templates,
        runs: this.dependencies.runs,
      },
      {
        tenant: templateRecord.tenantId,
        mode: context.mode,
        status: ['queued', 'running', 'paused'],
      },
    );

    if (governance.metrics.rejected > 0) {
      await this.dependencies.notifier.publish({
        runId: context.runId,
        status: 'paused',
        at: new Date().toISOString(),
        details: `policy-rejected:${governance.metrics.rejected}`,
      });
      return fail(new Error('governance-rejected'));
    }

    const executor = new RecoveryDrillExecutor();
    const execution = await executor.execute(context, plan);
    if (!execution.ok) {
      return fail(execution.error);
    }

    await this.dependencies.runs.upsertRun({ ...execution.value, context } as never);
    await this.dependencies.notifier.publish({
      runId: context.runId,
      status: execution.value.status,
      at: execution.value.endedAt ?? new Date().toISOString(),
      details: 'completed',
    });

    return ok(execution.value.status);
  }

  async cancel(runId: string): Promise<Result<boolean, Error>> {
    const parsed = runIdSchema.parse(runId);
    const run = await this.dependencies.runs.getRun(parsed as any);
    if (!run) return fail(new Error('run-not-found'));

    if (isActive(run)) {
      await this.dependencies.runs.upsertRun({ ...run, status: 'cancelled', endedAt: new Date().toISOString() } as never);
      await this.dependencies.notifier.publish({
        runId: parsed as never,
        status: 'cancelled',
        at: new Date().toISOString(),
      });
      return ok(true);
    }
    return ok(false);
  }

  async listByTenant(tenant: RecoveryDrillTenantId): Promise<Pick<DrillProgressEvent, 'runId' | 'status' | 'at'>[]> {
    const resolvedTenant = safeParseTenant(tenant);
    if (!resolvedTenant.ok) return [];

    const result = await this.dependencies.runs.listRuns({
      tenant: resolvedTenant.value,
      status: ['planned', 'queued', 'running', 'paused', 'succeeded', 'degraded', 'failed', 'cancelled'],
    } as DrillStoreQuery);

    return result.items.map((run) => ({
      runId: run.id,
      status: run.status,
      at: run.startedAt ?? run.endedAt ?? new Date().toISOString(),
    }));
  }

  async listOverview(tenant: string) {
    const templatesResult = await this.dependencies.templates.listTemplates(tenant);
    const runsResult = await this.dependencies.runs.listRuns({ tenant: tenant as any, status: undefined } as DrillStoreQuery);
    const overview = buildServiceOverview(templatesResult, runsResult.items);
    const hints = buildRunTemplateHints(runsResult.items, templatesResult);
    const byTenant = overview.byTenant.get(tenant) ?? {
      tenant,
      totalTemplates: 0,
      activeRuns: 0,
      queuedRuns: 0,
      successRate: 0,
      riskIndex: 0,
      topHeatpointTemplate: undefined,
    };

    return {
      overview,
      selectedByTemplate: Object.fromEntries(hints.entries()),
      metric: byTenant,
    };
  }

  async onboardPayload(raw: unknown): Promise<string> {
    const template = parseDrillTemplate(raw);
    const record = fromTemplate(template);
    await this.dependencies.templates.upsertTemplate(record);
    return record.templateId;
  }
}
