export type RecoveryDrillRunStepTag =
  | 'critical-path'
  | 'dependency-check'
  | 'rollback-safe'
  | 'manual-gate'
  | 'automation-only';

export const severityRank: Record<string, number> = {
  info: 1,
  warn: 2,
  degrade: 3,
  error: 4,
  critical: 5,
};

export const eventKindPriority: Record<string, number> = {
  signal: 1,
  metric: 2,
  checkpoint: 3,
  transition: 2,
  anomaly: 4,
};
