import { fail, ok } from '@shared/result';
import type { Result } from '@shared/result';
import { asCorrelation, asRun, asTenant } from '@domain/recovery-coordination';
import { createCoordinationProgram } from './helpers';
import type {
  CoordinationAttemptInput,
  CoordinationAttemptReport,
  CoordinationCommandContext,
} from './types';
import { RecoveryCoordinationOrchestrator } from './orchestrator';
import { createDefaultStore, type RecoveryCoordinationStore } from '@data/recovery-coordination-store';
import { buildWorkflowGraph } from '@domain/recovery-coordination';
import { InMemoryCoordinationDelivery } from '@infrastructure/recovery-coordination-notifier';
import type {
  CoordinationDeliveryChannel,
  CoordinationDeliveryEvent,
} from '@infrastructure/recovery-coordination-notifier';

export interface WorkflowRoute {
  readonly tenant: string;
  readonly runId: string;
  readonly phase: 'plan' | 'select' | 'execute' | 'observe';
  readonly queuedAt: string;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

export interface RoutePlan {
  readonly routeId: string;
  readonly routes: readonly WorkflowRoute[];
  readonly signals: readonly string[];
  readonly hasFallback: boolean;
}

export interface RouterSnapshot {
  readonly runId: string;
  readonly tenant: string;
  readonly queuedRoutes: number;
  readonly completedRoutes: number;
  readonly activePhase: WorkflowRoute['phase'];
}

export interface WorkflowRouterOptions {
  readonly orchestrator?: RecoveryCoordinationOrchestrator;
  readonly store?: RecoveryCoordinationStore;
  readonly delivery?: CoordinationDeliveryChannel;
}

export class RecoveryCoordinationWorkflowRouter {
  private readonly orchestrator: RecoveryCoordinationOrchestrator;
  private readonly delivery: CoordinationDeliveryChannel;
  private readonly store: RecoveryCoordinationStore;

  constructor(private readonly options: WorkflowRouterOptions = {}) {
    this.orchestrator = options.orchestrator ?? new RecoveryCoordinationOrchestrator();
    this.delivery = options.delivery ?? new InMemoryCoordinationDelivery();
    this.store = options.store ?? createDefaultStore();
  }

  async route(input: CoordinationAttemptInput): Promise<Result<RoutePlan, Error>> {
    const context: CoordinationCommandContext = {
      requestedBy: input.context.requestedBy,
      tenant: input.tenant,
      correlationId: input.context.correlationId,
    };

    const created = await this.orchestrator.coordinate(input);
    if (!created.ok) {
      return fail(created.error);
    }

    const plan = this.buildRoutePlan(input, created.value);
    const signals = collectSignalsFromAttempt(input);
    const published = await this.publishRoutePlan(created.value.tenant, plan, signals);
    if (!published.ok) {
      return fail(published.error);
    }

    const program = createCoordinationProgram(input.program, context);
    await this.store.save({
      recordId: `${input.context.correlationId}:route`,
      tenant: asTenant(input.tenant),
      runId: asRun(input.runId),
      program,
      selection: created.value.selection,
      window: {
        from: new Date().toISOString(),
        to: new Date(Date.now() + 60_000).toISOString(),
        timezone: 'UTC',
      },
      candidate: created.value.plan,
      createdAt: new Date().toISOString(),
      archived: false,
      tags: ['routed'],
    });

    return ok(plan);
  }

  async planHistory(tenant: string): Promise<readonly RouterSnapshot[]> {
    const list = await this.store.query({ tenant: tenant as never, take: 50 });
    return list.map((record) => {
      const graph = buildWorkflowGraph(record.program);
      const phase = record.selection.decision === 'approved' ? 'execute' : 'observe';
      return {
        runId: record.runId,
        tenant: record.tenant,
        queuedRoutes: 3,
        completedRoutes: graph.nodes.length > 0 ? 1 : 0,
        activePhase: phase,
      };
    });
  }

  private buildRoutePlan(input: CoordinationAttemptInput, report: CoordinationAttemptReport): RoutePlan {
    const signals = collectSignalsFromAttempt(input);
    const routes = input.program.steps.map((step, index): WorkflowRoute => ({
      tenant: report.tenant,
      runId: `${report.runId}`,
      phase: index % 4 === 0 ? 'plan' : index % 4 === 1 ? 'select' : index % 4 === 2 ? 'execute' : 'observe',
      queuedAt: new Date().toISOString(),
      startedAt: index < 1 ? undefined : new Date().toISOString(),
      completedAt: index < 1 ? undefined : new Date(Date.now() + 120_000).toISOString(),
    }));

    return {
      routeId: `${input.context.correlationId}:router`,
      routes,
      signals: signals.map((entry) => `${entry.title}:${entry.body}`),
      hasFallback: report.selection.decision !== 'approved',
    };
  }

  private async publishRoutePlan(
    tenant: string,
    plan: RoutePlan,
    signals: readonly CoordinationDeliveryEvent[],
  ): Promise<Result<boolean, Error>> {
    const event: CoordinationDeliveryEvent = {
      tenant: asTenant(tenant),
      runId: asRun(plan.routeId),
      title: `coordination-router:${plan.routeId}`,
      body: `routes=${plan.routes.length} signals=${signals.length}`,
      candidate: {
        id: plan.routeId,
        metadata: {
          parallelism: plan.routes.length,
          expectedCompletionMinutes: 12,
          riskIndex: 0.1,
          resilienceScore: 0.95,
        },
      },
      generatedAt: new Date().toISOString(),
    };

    const publish = await this.delivery.publish(event);
    if (!publish.ok) {
      return fail(publish.error);
    }

    const policyEvent: CoordinationDeliveryEvent = {
      tenant: asTenant(tenant),
      runId: asRun(plan.routeId),
      title: `coordination-policy:${plan.routeId}`,
      body: `decision=${plan.hasFallback ? 'deferred' : 'approved'} routes=${plan.routes.length}`,
      candidate: {
        id: `${plan.routeId}:policy`,
        metadata: {
          parallelism: plan.routes.length,
          expectedCompletionMinutes: 12,
          riskIndex: 0.1,
          resilienceScore: 0.95,
        },
      },
      generatedAt: new Date().toISOString(),
    };

    await this.delivery.publish(policyEvent);

    for (const signal of signals) {
      await this.delivery.publish(signal);
    }

    return ok(true);
  }
}

const collectSignalsFromAttempt = (input: CoordinationAttemptInput): readonly CoordinationDeliveryEvent[] => {
  return [
    {
      tenant: asTenant(input.tenant),
      runId: asRun(input.runId),
      title: 'attempt-created',
      body: `steps=${input.program.steps.length}`,
      candidate: {
        id: `${input.context.correlationId}:candidate`,
        metadata: {
          parallelism: 1,
          expectedCompletionMinutes: 12,
          riskIndex: 0.25,
          resilienceScore: 0.9,
        },
      },
      generatedAt: new Date().toISOString(),
    },
  ];
};
