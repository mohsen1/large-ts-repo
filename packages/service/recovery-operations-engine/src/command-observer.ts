import type { RecoveryOperationsRepository } from '@data/recovery-operations-store';
import type { RunSession, SessionDecision, RecoverySignal } from '@domain/recovery-operations-models';

export interface ObservationWindow {
  readonly runId: string;
  readonly tenant: string;
  readonly since: string;
  readonly until: string;
}

export interface DecisionTrend {
  readonly runId: string;
  readonly accepted: number;
  readonly rejected: number;
  readonly acceptanceRate: number;
  readonly lastReasonCodes: readonly string[];
}

const emptyTrend = {
  accepted: 0,
  rejected: 0,
  acceptanceRate: 0,
  lastReasonCodes: ['missing_session'],
};

export class CommandObserver {
  constructor(private readonly repository: RecoveryOperationsRepository) {}

  async inspect(window: ObservationWindow): Promise<DecisionTrend> {
    const session = await this.repository.loadSessionByRunId(window.runId);
    if (!session) {
      return {
        runId: window.runId,
        ...emptyTrend,
      };
    }

    const lifecycle = await this.repository.findLifecycle({ runId: window.runId, status: ['running', 'completed', 'failed'] });
    const decisions = lifecycle
      .map((entry) => ({
        runId: session.runId,
        ticketId: session.ticketId,
        accepted: entry.status !== 'failed',
        reasonCodes: [`status:${entry.status}`],
        score: 1,
        createdAt: new Date().toISOString(),
      } as SessionDecision));

    const accepted = decisions.reduce((acc, decision) => acc + (decision.accepted ? 1 : 0), 0);
    const rejected = decisions.length - accepted;
    return {
      runId: String(session.runId),
      accepted,
      rejected,
      acceptanceRate: decisions.length ? accepted / decisions.length : 0,
      lastReasonCodes: decisions.length ? decisions[0]!.reasonCodes : emptyTrend.lastReasonCodes,
    };
  }

  async inspectByTenant(_tenant: string, limit = 20): Promise<readonly RunSession[]> {
    const latest = await this.repository.loadLatestSnapshot(_tenant);
    if (!latest?.sessions?.length) {
      return [];
    }
    return latest.sessions.slice(-limit);
  }
}

export const createCommandObserver = (repository: RecoveryOperationsRepository): CommandObserver => {
  return new CommandObserver(repository);
};

export const inspectCommandWindow = async (
  repository: RecoveryOperationsRepository,
  tenant: string,
  runId: string,
): Promise<DecisionTrend> => {
  const observer = createCommandObserver(repository);
  return observer.inspect({
    runId,
    tenant,
    since: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    until: new Date().toISOString(),
  });
};
