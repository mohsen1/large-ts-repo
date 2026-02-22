import { z } from 'zod';
import { S3Client } from '@aws-sdk/client-s3';
import { executeRuntimeRun, buildRuntimeFromSeed } from '@service/decision-runtime';
import { fail, ok, type Result } from '@shared/result';
import { type MessageId, type CorrelationId } from '@shared/protocol';
import { InMemoryBus, type MessageBus } from '@platform/messaging';
import {
  nextRequestId,
  normalizePriority,
  sanitizeTenantId,
  type DecisionMeshEnvelope,
  type DecisionMeshResult,
  type DecisionMeshRequest,
  type MeshErrorContext,
  type MeshPageResponse,
  type MeshPageArgs,
  type PolicyBundle,
  type RankedCandidate,
} from './types';
import { DecisionRequestSchema, BatchRequestSchema, RegisterPolicyBatchSchema, type DecisionRequest, type BatchRequest } from './schema';
import { MessageBusAdapter } from './adapters/bus';
import { EventBridgePublisher } from './adapters/eventbridge';
import { clampPage } from './types';
import { createMemoryPolicyRegistry, type PolicyRegistry } from './registry';
import { rankCandidates, selectPrimaryCandidate } from './strategy';
import { InMemoryMeshTelemetry, type MeshTelemetry } from './telemetry';

export interface DecisionMeshRuntimeOptions {
  namespace: string;
  bus?: MessageBus;
  telemetry?: MeshTelemetry;
  publisher?: EventBridgePublisher;
}

const DEFAULT_POLICY_PAGE_SIZE = 25;

export class DecisionMeshOrchestrator {
  private readonly registry: PolicyRegistry;
  private readonly telemetry: MeshTelemetry;
  private readonly busAdapter: MessageBusAdapter;
  private readonly publisher?: EventBridgePublisher;

  constructor(
    options: DecisionMeshRuntimeOptions = { namespace: 'default' },
    seed: Record<string, unknown> = {},
  ) {
    this.registry = createMemoryPolicyRegistry();
    this.telemetry = options.telemetry ?? new InMemoryMeshTelemetry();
    const bus = options.bus ?? new InMemoryBus();
    this.busAdapter = new MessageBusAdapter(bus);
    this.publisher = options.publisher;

    Object.values(seed as Record<string, unknown>).forEach(async (policy) => {
      const upserted = await this.registry.upsert(policy);
      if (!upserted.ok) {
        await this.busAdapter.publishFailed(`seed-${Date.now()}`, upserted.error.message);
      }
    });
  }

  async bootstrap(raw: unknown): Promise<Result<number, MeshErrorContext>> {
    const parsed = RegisterPolicyBatchSchema.safeParse(raw);
    if (!parsed.success) {
      return fail({
        requestId: nextRequestId(),
        at: new Date().toISOString(),
        message: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join('; '),
      });
    }

    let inserted = 0;
    for (const policy of parsed.data.policies) {
      const upserted = await this.registry.upsert(policy);
      if (upserted.ok) {
        inserted += 1;
      } else {
        await this.busAdapter.publishFailed(`bootstrap-${inserted}`, upserted.error.message);
      }
    }

    return ok(inserted);
  }

  async run(raw: DecisionRequest | unknown): Promise<Result<DecisionMeshResult, MeshErrorContext>> {
    const parsed = DecisionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return fail({
        requestId: nextRequestId(),
        at: new Date().toISOString(),
        message: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join('; '),
      });
    }

    const request: DecisionRequest = { ...parsed.data, priority: normalizePriority(parsed.data.priority) };
    const tenantId = sanitizeTenantId(request.tenantId);
    const requestId = nextRequestId();
    const envelope: DecisionMeshEnvelope = {
      requestId,
      tenantId,
      traceId: `${Date.now()}-${requestId}` as any,
      request: request as DecisionMeshRequest,
      acceptedAt: new Date().toISOString(),
    };

    this.telemetry.markStarted({ requestId, tenantId, eventType: 'started' });
    await this.busAdapter.publishStarted({ requestId, tenantId, policyId: request.policyId });

    const ranked: RankedCandidate<PolicyBundle>[] = rankCandidates({
      tenantId: request.tenantId,
      requestPriority: request.priority,
      candidates: this.registry.findByTenant(request.tenantId),
      mode: request.mode,
    });

    if (ranked.length === 0) {
      const error = {
        requestId,
        at: new Date().toISOString(),
        message: 'No active policy candidates found',
      };
      this.telemetry.markFailed({ requestId, tenantId, eventType: 'failed', status: 'no-policies' }, error.message);
      await this.busAdapter.publishFailed(requestId, error.message);
      return fail(error);
    }

    const selected = selectPrimaryCandidate(ranked);
    if (!selected) {
      const error = {
        requestId,
        at: new Date().toISOString(),
        message: 'Candidate selection returned empty result',
      };
      await this.busAdapter.publishFailed(requestId, error.message);
      return fail(error);
    }

    const start = Date.now();
    const runtimeResult = await this.telemetry.observe('mesh.execute-runtime', async () => {
    const runtime = buildRuntimeFromSeed({ [selected.meta.policyId]: selected.template } as Record<string, Record<string, unknown>>);
      return executeRuntimeRun(
        {
          tenantId: request.tenantId,
          subjectId: request.subjectId,
          policyId: selected.meta.policyId,
          context: request.context,
        },
        { repository: runtime.store, s3Client: new S3Client({}) },
      );
    });

    const runtimeMs = Date.now() - start;
    if (typeof runtimeResult === 'string') {
      const messageId = requestId as unknown as MessageId;
      const correlationId = requestId as unknown as CorrelationId;
      const result: DecisionMeshResult = {
        requestId,
        tenantId,
        policyId: selected.template.id,
        selectedActors: runtimeResult ?? 'unresolved',
        risk: request.priority >= 9 ? 'high' : 'medium',
        runtimeMs,
        policyVersion: selected.template.version,
        traceId: envelope.traceId,
      };
      this.telemetry.markCompleted({ requestId, tenantId, eventType: 'completed', status: result.risk }, runtimeMs);
      await this.busAdapter.publishCompleted(result);
      if (this.publisher) {
        void this.publisher.publish(
          {
            id: messageId,
            correlationId,
            timestamp: new Date().toISOString(),
            eventType: 'mesh.decision.completed',
            payload: result,
          },
          'completed',
        );
      }
      return ok(result);
    }

    this.telemetry.markFailed({ requestId, tenantId, eventType: 'failed', status: 'runtime-rejected' }, String(runtimeResult));
    await this.busAdapter.publishFailed(requestId, String(runtimeResult));
    return fail({
      requestId,
      at: new Date().toISOString(),
      message: runtimeResult as string,
    });
  }

  async runBatch(raw: unknown): Promise<Result<DecisionMeshResult[], MeshErrorContext>> {
    const parsed = BatchRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return fail({
        requestId: nextRequestId(),
        at: new Date().toISOString(),
        message: parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join('; '),
      });
    }

    const request = parsed.data as BatchRequest;
    const results: DecisionMeshResult[] = [];

    for (const item of request.requests) {
      const outcome = await this.run({ ...item, tenantId: request.tenantId });
      if (!outcome.ok) {
        return fail({
          requestId: nextRequestId(),
          at: new Date().toISOString(),
          message: `batch ${request.runId} rejected by request ${item.subjectId}`,
        });
      }
      results.push(outcome.value);
    }

    return ok(results);
  }

  listPolicies(args: Partial<MeshPageArgs>): MeshPageResponse<PolicyBundle> {
    const sanitized = clampPage({
      cursor: args.cursor ?? '0',
      limit: args.limit ?? DEFAULT_POLICY_PAGE_SIZE,
      tenantId: args.tenantId,
    });
    const policies = sanitized.tenantId ? this.registry.findByTenant(sanitized.tenantId) : this.registry.all();
    const start = Number(sanitized.cursor ?? 0);
    const end = Math.min(policies.length, start + sanitized.limit);

    return {
      items: policies.slice(start, end),
      cursor: String(end),
      hasMore: end < policies.length,
      total: policies.length,
    };
  }

  metrics() {
    return this.telemetry.report();
  }
}

export const createDecisionMesh = (namespace: string, seed?: Record<string, unknown>): DecisionMeshOrchestrator =>
  new DecisionMeshOrchestrator({ namespace }, seed);
export const createTelemetry = (): MeshTelemetry => new InMemoryMeshTelemetry();
