import { z } from 'zod';

import { parseDrillContext, parseDrillTemplate } from '@domain/recovery-drill/src/schema';
import { buildPlan } from './planner';
import { RecoveryDrillExecutor } from './execution';
import { fromTemplate, buildRunRecord, isActive } from '@data/recovery-drill-store/src/adapter';
import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import type { DrillStoreQuery } from '@data/recovery-drill-store';
import type { DrillDependencies, DrillProgressEvent, DrillStartInput } from './types';
import type { DrillRunPlan } from './types';

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
      mode: input.mode ?? templateRecord.template.mode,
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
      details: `queued-with-${plan.scenarioOrder.length}-scenarios`,
    });

    const executor = new RecoveryDrillExecutor();
    const execution = await executor.execute(context, plan);
    if (!execution.ok) {
      return fail(execution.error);
    }

    await this.dependencies.runs.upsertRun({ ...execution.value, context } as any);
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
      await this.dependencies.runs.upsertRun({ ...run, status: 'cancelled', endedAt: new Date().toISOString() } as any);
      await this.dependencies.notifier.publish({
        runId: parsed as any,
        status: 'cancelled',
        at: new Date().toISOString(),
      });
      return ok(true);
    }
    return ok(false);
  }

  async listByTenant(tenant: string): Promise<Pick<DrillProgressEvent, 'runId' | 'status' | 'at'>[]> {
    const result = await this.dependencies.runs.listRuns({
      tenant,
      status: ['planned', 'queued', 'running', 'paused', 'succeeded', 'degraded', 'failed', 'cancelled'],
    } as DrillStoreQuery);
    return result.items.map((run) => ({
      runId: run.id,
      status: run.status,
      at: run.startedAt ?? run.endedAt ?? new Date().toISOString(),
    }));
  }
}
