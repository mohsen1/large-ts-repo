import type { CommandLabRecord } from './lab-records';
import type { CommandLabRecordStatus } from './lab-records';

const compareRisk = (left: CommandLabRecord, right: CommandLabRecord): number => {
  if (right.riskScore === left.riskScore) {
    return right.expectedRunMinutes - left.expectedRunMinutes;
  }
  return right.riskScore - left.riskScore;
};

export const queryByStatus = (
  records: readonly CommandLabRecord[],
  status: CommandLabRecordStatus,
): readonly CommandLabRecord[] => records.filter((record) => record.status === status);

export const queryByRiskBand = (records: readonly CommandLabRecord[], threshold = 0.7): readonly CommandLabRecord[] =>
  records.filter((record) => record.riskScore >= threshold).sort(compareRisk);

export const queryByPlan = (records: readonly CommandLabRecord[], planId?: string): readonly CommandLabRecord[] =>
  records.filter((record) => (planId ? record.planId === planId : true)).sort(compareRisk);

export const summarizeRecordStats = (records: readonly CommandLabRecord[]) => {
  const grouped = records.reduce(
    (acc, record) => {
      acc.total += 1;
      acc.byStatus[record.status] = (acc.byStatus[record.status] ?? 0) + 1;
      acc.totalExpectedRunMinutes += record.expectedRunMinutes;
      acc.maxRisk = Math.max(acc.maxRisk, record.riskScore);
      return acc;
    },
    {
      total: 0,
      byStatus: {} as Record<CommandLabRecordStatus, number>,
      totalExpectedRunMinutes: 0,
      maxRisk: 0,
    },
  );
  return {
    ...grouped,
    averageExpectedRunMinutes: grouped.total === 0 ? 0 : grouped.totalExpectedRunMinutes / grouped.total,
  };
};
