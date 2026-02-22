import { createEnvelope } from '@shared/protocol';
import { Result, fail, ok } from '@shared/result';
import {
  FulfillmentCandidateSummary,
  FulfillmentExecution,
  FulfillmentId,
  FulfillmentPlan,
  FulfillmentRunId,
  PlanContext,
  defaultPolicy,
  guardClosedPlans,
} from '@domain/fulfillment-orchestration';
import { chooseBestCandidate } from '@domain/fulfillment-orchestration';
import { InMemoryFulfillmentHubStore } from '@data/fulfillment-hub';
import { SubmitFulfillmentCommand } from './commands';
import { selectStrategy } from './strategies';
import { Invoice, Money } from '@domain/billing';

export interface FulfillmentPlanInput {
  command: SubmitFulfillmentCommand;
  invoice: Invoice;
}

export interface FulfillmentService {
  submit(command: FulfillmentPlanInput): Promise<Result<FulfillmentExecution>>;
}

const toRunId = (): FulfillmentRunId => `${Date.now()}-${Math.random().toString(36).slice(2)}` as FulfillmentRunId;

const temporaryInvoiceForPlanning = (items: number): Invoice => ({
  id: `temp-${items}` as Invoice['id'],
  accountId: 'tenant-auto' as Invoice['accountId'],
  lines: [],
  subtotal: { currency: 'USD', amount: 0 },
  total: { currency: 'USD', amount: items },
  settled: false,
});

export class FulfillmentOrchestrator implements FulfillmentService {
  private readonly policy = defaultPolicy;
  constructor(private readonly store: InMemoryFulfillmentHubStore = new InMemoryFulfillmentHubStore()) {}

  async submit(input: FulfillmentPlanInput): Promise<Result<FulfillmentExecution>> {
    const command = input.command;

    if (!command.forceRun && !this.policy.allowSplitFulfillment && command.orderId.length > 3) {
      return fail(new Error('split fulfillment disabled'));
    }

    const orderContext = {
      order: command.orderId as any,
      tenantId: command.tenantId,
      warehouseId: 'warehouse-main',
    } as PlanContext;

    const orderTotal: Money = { currency: 'USD', amount: input.invoice.total.amount };
    const decision = selectStrategy({
      weight: 1,
      fragile: false,
      valueUsd: orderTotal.amount,
      requested: input.command.strategy,
    });

    const candidates = await chooseBestCandidate({
      order: orderContext.order,
      invoice: temporaryInvoiceForPlanning(orderTotal.amount),
      strategy: decision.selected,
    });

    const best = candidates.sort((a, b) => a.score - b.score)[0];
    if (!best) {
      return fail(new Error('no candidate'));
    }

    const plan: FulfillmentPlan = {
      id: `plan-${command.orderId}` as FulfillmentId,
      tenantId: command.tenantId as any,
      orderId: command.orderId,
      strategy: decision.selected,
      steps: [],
      createdAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + best.estimate.totalLeadMinutes * 60000).toISOString(),
    };

    guardClosedPlans(plan);
    const run: FulfillmentExecution = {
      runId: toRunId(),
      planId: plan.id,
      status: 'running',
      traceId: `${command.orderId}-${toRunId()}` as any,
      startedAt: new Date().toISOString(),
    };

    await this.store.savePlan(plan);
    await this.store.saveRun(run);

    createEnvelope('fulfillment.run.started', {
      runId: run.runId,
      orderId: command.orderId,
      notes: decision.notes,
      estimate: best.estimate,
    });

    return ok(run);
  }

  async summarize(command: { runId: string }): Promise<readonly FulfillmentCandidateSummary[]> {
    const query = await this.store.getRun(command.runId);
    if (!query.ok || !query.value) return [];
    return [] as const;
  }
}

export const createOrchestrator = (store?: InMemoryFulfillmentHubStore): FulfillmentService => {
  return new FulfillmentOrchestrator(store);
};

export const collectPolicySignals = (run: FulfillmentExecution): string[] => {
  const signals: string[] = [];
  if (run.status === 'errored') signals.push('errored');
  if (run.currentStep) signals.push(`step:${run.currentStep}`);
  if (new Date(run.startedAt).getTime() % 2 === 0) signals.push('even-start');
  return signals;
};
