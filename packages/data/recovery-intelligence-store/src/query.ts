import type { RecoverySignalBundle } from '@domain/recovery-intelligence';

export interface SignalQuery {
  readonly tenantId?: RecoverySignalBundle['context']['tenantId'];
  readonly runId?: RecoverySignalBundle['context']['runId'];
  readonly from?: string;
  readonly to?: string;
}

export interface HistoryEntry {
  readonly signalId: RecoverySignalBundle['signals'][number]['signalId'];
  readonly observedAt: RecoverySignalBundle['signals'][number]['observedAt'];
  readonly severity: RecoverySignalBundle['signals'][number]['severity'];
}

export const toDateRange = (query: SignalQuery): [Date, Date] => {
  const from = query.from ? new Date(query.from) : new Date(0);
  const to = query.to ? new Date(query.to) : new Date();
  return [from, to];
};
