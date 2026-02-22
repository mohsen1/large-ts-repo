import type {
  RecoveryOperationsEnvelope,
  RecoverySignal,
  RunSession,
} from '@domain/recovery-operations-models';
import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import { ok, fail } from '@shared/result';

interface ConsumerDependencies {
  readonly repository: RecoveryOperationsRepository;
}

export class RecoveryOperationsConsumer {
  constructor(private readonly dependencies: ConsumerDependencies) {}

  async ingestSignal(rawEnvelope: string): Promise<ReturnType<typeof ok> | ReturnType<typeof fail>> {
    let parsed: RecoveryOperationsEnvelope<RecoverySignal>;
    try {
      parsed = JSON.parse(rawEnvelope) as RecoveryOperationsEnvelope<RecoverySignal>;
    } catch {
      return fail('INVALID_JSON', 'Malformed signal envelope');
    }

    const session: RunSession = {
      id: `${parsed.tenant}-${parsed.eventId}` as any,
      runId: `${parsed.tenant}-${Math.floor(Date.now() / 1000)}` as any,
      ticketId: `ticket-${parsed.eventId}` as any,
      planId: `plan-${parsed.eventId}` as any,
      status: 'queued',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      constraints: {
        maxParallelism: 3,
        maxRetries: 2,
        timeoutMinutes: 30,
        operatorApprovalRequired: parsed.payload.severity > 7,
      },
      signals: [parsed.payload],
    };

    await this.dependencies.repository.upsertSession(session);
    return ok(session);
  }
}
