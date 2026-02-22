import type { StoredScenarioRecord, ScenarioStoreSnapshot } from './models';

export interface ScenarioSignalMetrics {
  readonly tenantId: string;
  readonly avgRiskScore: number;
  readonly avgCompletionMinutes: number;
  readonly topWindowState: string;
  readonly samples: number;
}

export const computeScenarioMetrics = (records: readonly StoredScenarioRecord[]): ScenarioSignalMetrics[] => {
  const grouped = new Map<string, StoredScenarioRecord[]>();

  for (const record of records) {
    const arr = grouped.get(record.tenantId) ?? [];
    arr.push(record);
    grouped.set(record.tenantId, arr);
  }

  return Array.from(grouped.entries()).map(([tenantId, entries]) => {
    const scores = entries.map((entry) => entry.payload.finalRiskScore);
    const minutes = entries.map((entry) => entry.payload.actionPlan.estimatedCompletionMinutes);
    const states = entries.reduce<Record<string, number>>((acc, entry) => {
      acc[entry.payload.windowState] = (acc[entry.payload.windowState] ?? 0) + 1;
      return acc;
    }, {});

    const topWindowState = Object.entries(states)
      .sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'draft';

    return {
      tenantId,
      avgRiskScore: scores.reduce((sum, score) => sum + score, 0) / Math.max(scores.length, 1),
      avgCompletionMinutes: minutes.reduce((sum, minute) => sum + minute, 0) / Math.max(minutes.length, 1),
      topWindowState,
      samples: entries.length,
    };
  });
};

export const aggregateSummaries = (snapshots: readonly ScenarioStoreSnapshot[]): Record<string, number> => {
  return snapshots.reduce<Record<string, number>>((acc, snapshot) => {
    acc[snapshot.tenantId] = snapshot.count;
    return acc;
  }, {});
};
