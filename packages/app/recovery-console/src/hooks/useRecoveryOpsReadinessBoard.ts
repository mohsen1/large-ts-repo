import { useEffect, useState } from 'react';
import { InMemoryRecoveryOperationsRepository } from '@data/recovery-operations-store';
import { buildCommandHubMetrics } from '@data/recovery-operations-store';

export interface BoardGateway {
  readonly planId: string;
  readonly score: number;
  readonly risk: string;
  readonly matrixRiskScore: number;
}

export interface ReadinessBoardState {
  readonly tenant: string;
  readonly generatedAt: string;
  readonly routes: readonly BoardGateway[];
  readonly overallReadiness: number;
  readonly note: string;
  readonly refreshKey: number;
  readonly refresh: () => void;
}

const toRiskLabel = (score: number): string => {
  if (score >= 0.75) return 'green';
  if (score >= 0.5) return 'yellow';
  return 'red';
};

export const useRecoveryOpsReadinessBoard = (tenant: string): ReadinessBoardState => {
  const [routes, setRoutes] = useState<readonly BoardGateway[]>([]);
  const [overallReadiness, setOverallReadiness] = useState(0);
  const [generatedAt, setGeneratedAt] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const repository = new InMemoryRecoveryOperationsRepository();
    void buildCommandHubMetrics(repository, tenant).then((metrics) => {
      const mapped = metrics.gateways.map((gateway) => ({
        planId: gateway.planId,
        score: gateway.score,
        risk: toRiskLabel(gateway.score),
        matrixRiskScore: metrics.summary.matrixRiskScore,
      }));

      const readiness = metrics.summary.commandSurfaceScore > 0
        ? Number((1 - metrics.summary.matrixRiskScore / Math.max(1, metrics.summary.commandSurfaceScore)).toFixed(4))
        : 0;

      setRoutes(mapped);
      setOverallReadiness(readiness);
      setGeneratedAt(new Date().toISOString());
    });
  }, [tenant, refreshKey]);

  return {
    tenant,
    generatedAt,
    routes,
    overallReadiness,
    note: `routes=${routes.length}`,
    refreshKey,
    refresh: () => setRefreshKey((current) => current + 1),
  };
};
