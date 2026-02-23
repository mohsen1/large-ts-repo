import { IntentStoreSnapshot, PlanLink } from './types';
import { RecoveryIntent, evaluateRisk } from '@domain/recovery-cockpit-orchestration-core';
import { IntentId } from '@domain/recovery-cockpit-orchestration-core';

export type IntentHeatTile = Readonly<{
  intentId: string;
  label: string;
  status: RecoveryIntent['status'];
  risk: number;
  recommendation: string;
  scope: RecoveryIntent['scope'];
}>;

export type IntentOverview = Readonly<{
  snapshot: IntentStoreSnapshot;
  hotspots: ReadonlyArray<IntentHeatTile>;
  zoneCoverage: ReadonlyArray<{ zone: string; count: number }>;
  planCoverage: ReadonlyArray<{ planId: string; linkedIntents: number }>;
}>;

const rankRisk = (risk: number): string => (risk >= 80 ? 'high' : risk >= 55 ? 'medium' : 'low');

export const toHeatTile = (intent: RecoveryIntent): IntentHeatTile => {
  const assessment = evaluateRisk(intent);
  return {
    intentId: intent.intentId,
    label: intent.title,
    status: intent.status,
    risk: assessment.compositeScore,
    recommendation: `${rankRisk(assessment.compositeScore)}:${assessment.recommendation}`,
    scope: intent.scope,
  };
};

export const toZoneCoverage = (intents: readonly RecoveryIntent[]): ReadonlyArray<{ zone: string; count: number }> => {
  const counts = intents.reduce(
    (acc, intent) => {
      acc.set(intent.zone, (acc.get(intent.zone) ?? 0) + 1);
      return acc;
    },
    new Map<string, number>(),
  );

  return [...counts.entries()]
    .map(([zone, count]) => ({ zone, count }))
    .sort((left, right) => right.count - left.count);
};

export const toPlanCoverage = (links: readonly PlanLink[]): ReadonlyArray<{ planId: string; linkedIntents: number }> => {
  const counts = links.reduce(
    (acc, link) => {
      acc.set(link.planId, (acc.get(link.planId) ?? 0) + 1);
      return acc;
    },
    new Map<string, number>(),
  );

  return [...counts.entries()].map(([planId, linkedIntents]) => ({ planId, linkedIntents })).sort((left, right) => right.linkedIntents - left.linkedIntents);
};

export const buildOverview = (
  intents: readonly RecoveryIntent[],
  snapshot: IntentStoreSnapshot,
  links: readonly PlanLink[],
): IntentOverview => ({
  snapshot,
  hotspots: intents.map(toHeatTile),
  zoneCoverage: toZoneCoverage(intents),
  planCoverage: toPlanCoverage(links),
});

export const summarizeCoverage = (overview: IntentOverview): string =>
  `Total ${overview.snapshot.totalIntents} intents across ${overview.zoneCoverage.length} zones`;

export const filterHotspots = (tiles: readonly IntentHeatTile[], threshold = 60): IntentHeatTile[] =>
  tiles.filter((tile) => tile.risk >= threshold);

export const sortTiles = (tiles: readonly IntentHeatTile[], key: keyof IntentHeatTile = 'risk'): IntentHeatTile[] =>
  [...tiles].sort((left, right) =>
    typeof left[key] === 'number' && typeof right[key] === 'number'
      ? Number(right[key]) - Number(left[key])
      : String(left[key]).localeCompare(String(right[key])),
  );

export const toTileIndex = (tiles: readonly IntentHeatTile[]): Readonly<Record<string, IntentHeatTile>> =>
  tiles.reduce((acc, tile) => ({ ...acc, [tile.intentId]: tile }), {} as Record<string, IntentHeatTile>);
