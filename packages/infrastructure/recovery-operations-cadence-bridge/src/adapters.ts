import { fail, ok, type Result } from '@shared/result';
import type { CadenceRunPlan } from '@domain/recovery-operations-cadence';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { CadenceTransport } from './transport';
import { createCadenceTransport } from './transport';
import { createCadenceBridgeEnvelope, mapSignalsToEvents, toTelemetryRows } from './mapper';

export interface CadenceAdapterConfig {
  readonly repository: RecoveryOperationsRepository;
  readonly transport?: CadenceTransport;
  readonly topicArn?: string;
  readonly region?: string;
}

export interface CadenceAdapter {
  publish(plan: CadenceRunPlan): Promise<Result<void, string>>;
  replay(plan: CadenceRunPlan): Promise<Result<string, string>>;
  replayLatestByTenant(tenant: string): Promise<Result<number, string>>;
}

export class RecoveryCadenceAdapter implements CadenceAdapter {
  private readonly transport: CadenceTransport;
  private readonly repository: RecoveryOperationsRepository;

  constructor(config: CadenceAdapterConfig) {
    this.repository = config.repository;
    this.transport =
      config.transport ??
      createCadenceTransport({
        region: config.region,
        topicArn: config.topicArn ?? 'in-memory',
        source: 'recovery-operations-cadence-adapter',
      });
  }

  async publish(plan: CadenceRunPlan): Promise<Result<void, string>> {
    const envelope = createCadenceBridgeEnvelope(plan);
    if (envelope.payload.events && envelope.payload.events.length === 0) {
      return fail('INVALID_PLAN', 'Plan does not target any windows');
    }

    try {
      await this.transport.publishPlan(plan);
      await this.transport.publishStatus(String(plan.id), 'published', {
        score: plan.readinessScore,
        outcome: plan.outcome,
      });
      return ok(undefined);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'transport-failed';
      return fail('TRANSPORT_ERROR', reason);
    }
  }

  async replay(plan: CadenceRunPlan): Promise<Result<string, string>> {
    const snapshot = createCadenceBridgeEnvelope(plan);
    const syntheticSignals = plan.slots.map((slot, index) => ({
      id: String(slot.id),
      source: String(plan.profile.tenant),
      severity: Math.min(10, index + 1),
      confidence: 0.9,
      detectedAt: new Date().toISOString(),
      details: { command: slot.command, windowId: String(slot.windowId) },
    }));
    const eventMap = mapSignalsToEvents(syntheticSignals);

    if (!eventMap.ok) {
      return fail('NO_EVENTS', 'No synthetic events found for replay');
    }

    const rows = toTelemetryRows(plan, syntheticSignals);
    const eventPayload = JSON.stringify({
      ...snapshot,
      events: eventMap.value,
      telemetry: rows,
      emittedAt: new Date().toISOString(),
    });

    await this.transport.publishEvents([eventPayload]);
    return ok(String(snapshot.id));
  }

  async replayLatestByTenant(tenant: string): Promise<Result<number, string>> {
    const snapshot = await this.repository.loadLatestSnapshot(tenant);
    if (!snapshot) {
      return fail('TENANT_MISSING', `tenant ${tenant} has no snapshot`);
    }

    const sessions = snapshot.sessions;
    if (sessions.length === 0) {
      return fail('EMPTY_SESSION', `tenant ${tenant} has no active sessions`);
    }

    const planCount = sessions.length;
    await this.transport.publishStatus(
      `tenant-${tenant}`,
      'replay-latest',
      {
        tenant,
        planCount,
        sessions: sessions.map((session) => ({
          runId: String(session.runId),
          ticket: String(session.ticketId),
          status: session.status,
        })),
      },
    );

    return ok(planCount);
  }
}

export const createCadenceAdapter = (config: CadenceAdapterConfig): CadenceAdapter => {
  return new RecoveryCadenceAdapter(config);
};
