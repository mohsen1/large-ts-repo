import { z } from 'zod';
import { runPlanId, type TenantId, type RunPlanId, type OrchestrationEnvelope, type OrchestrationPlanInput, type OrchestrationPlanOutput, incidentId } from '../domain/models';

const planInputSchema = z.object({
  tenant: z.string().min(1),
  incident: z.string().min(1),
  title: z.string().min(1),
  requestedAt: z.string(),
  runId: z.string(),
  signals: z.array(
    z.object({
      id: z.string(),
      tenant: z.string(),
      incident: z.string(),
      category: z.string(),
      severity: z.enum(['critical', 'high', 'moderate', 'low']),
      channel: z.enum(['telemetry', 'scheduler', 'manual', 'agent']),
      origin: z.string(),
      detail: z.object({
        code: z.string(),
        value: z.number(),
        tags: z.array(z.string()),
        metadata: z.record(z.union([z.string(), z.number(), z.boolean()])),
      }),
    }),
  ),
  window: z.object({
    start: z.string(),
    end: z.string(),
    tz: z.string(),
  }),
  metrics: z.object({
    reliability: z.number(),
    throughput: z.number(),
    confidence: z.number(),
  }),
});

const planEnvelopeSchema = z.object({
  tenant: z.string(),
  runId: z.string(),
  status: z.enum(['queued', 'warming', 'active', 'rollback', 'resolved']),
  output: z.object({
    runId: z.string(),
    directives: z.array(
      z.object({
        name: z.string(),
        weight: z.number(),
        conditions: z.array(z.string()),
        controls: z.array(z.object({ service: z.string(), action: z.string(), priority: z.number() })),
      }),
    ),
    artifacts: z.array(
      z.object({
        tenant: z.string(),
        runId: z.string(),
        createdAt: z.string(),
        checksums: z.record(z.string()),
      }),
    ),
    summary: z.string(),
  }),
  timeline: z.array(
    z.object({
      plugin: z.string(),
      startedAt: z.string(),
      elapsedMs: z.number(),
      status: z.enum(['idle', 'running', 'success', 'skipped', 'degraded', 'failed']),
      details: z.record(z.unknown()).optional(),
    }),
  ),
});

export interface PlanAdapter {
  connect(tenant: TenantId, runId: RunPlanId): Promise<void>;
  execute(input: OrchestrationPlanInput): Promise<OrchestrationPlanOutput>;
  report(input: OrchestrationEnvelope<OrchestrationPlanOutput>): Promise<void>;
  [Symbol.dispose](): void;
  [Symbol.asyncDispose](): Promise<void>;
}

export class ReplayPlanAdapter implements PlanAdapter {
  #connected = false;
  #disconnected = false;

  public async connect(tenant: TenantId, runId: RunPlanId): Promise<void> {
    const parsed = planInputSchema.safeParse({
      tenant,
      incident: 'incident-demo',
      title: 'recovery-orchestration-lab demo',
      requestedAt: new Date().toISOString(),
      runId,
      signals: [],
      window: {
        start: new Date().toISOString(),
        end: new Date(Date.now() + 1.8 * 60 * 60 * 1000).toISOString(),
        tz: 'UTC',
      },
      metrics: {
        reliability: 1,
        throughput: 100,
        confidence: 0.99,
      },
    });

    if (!parsed.success) {
      throw new Error('Invalid plan envelope');
    }

    this.#connected = true;
  }

  public async execute(input: OrchestrationPlanInput): Promise<OrchestrationPlanOutput> {
    const parsed = planInputSchema.parse(input);
    if (parsed.title.length > 0) {
      return {
        runId: runPlanId(parsed.runId),
        directives: [],
        artifacts: [
          {
            tenant: parsed.tenant as TenantId,
            runId: runPlanId(parsed.runId),
            createdAt: new Date().toISOString(),
            checksums: { adapter: 'replay-plan-adapter' },
          },
        ],
        summary: 'adapter-default-pass-through',
      };
    }
    throw new Error('Missing title');
  }

  public async report(input: OrchestrationEnvelope<OrchestrationPlanOutput>): Promise<void> {
    const parsed = planEnvelopeSchema.parse({
      tenant: input.tenant,
      runId: input.runId,
      status: input.status,
      output: input.output,
      timeline: input.timeline,
    });

    if (!this.#connected || this.#disconnected) {
      return;
    }

    await Promise.resolve({
      run: parsed.runId,
      status: parsed.status,
      directiveCount: parsed.output.directives.length,
      timeline: parsed.timeline.length,
      incident: parsed.output.artifacts[0]?.tenant ? incidentId(parsed.output.artifacts[0].tenant) : undefined,
    });
  }

  [Symbol.dispose](): void {
    this.#disconnected = true;
  }

  async [Symbol.asyncDispose](): Promise<void> {
    this.#disconnected = true;
  }
}
