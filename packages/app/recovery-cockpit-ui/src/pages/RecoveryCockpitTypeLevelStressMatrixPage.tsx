import { useState } from 'react';
import {
  useRecoveryStressWorkbench,
  type StressWorkbenchPayload,
} from '../hooks/useRecoveryStressWorkbench';
import { StressBinaryFlowPanel } from '../components/stress/StressBinaryFlowPanel';
import { StressInstantiationWorkbench } from '../components/stress/StressInstantiationWorkbench';
import { StressRouteMatrix } from '../components/stress/StressRouteMatrix';
import { StressWorkbenchPanel } from '../components/stress/StressWorkbenchPanel';
import { resolveWorkbenchInput } from '../services/recoveryCockpitStressWorkloadService';
import type { OrbitAction, OrbitRoute } from '@shared/type-level';

const defaultTenant = resolveWorkbenchInput('tenant-stress-matrix-0002');

const formatRouteRows = (tenantId: string, enabledOnly: boolean) => {
  const rows = Object.values(defaultTenant.routeMap).map((entry) => ({
    id: entry.route,
    action: entry.route.split('/')[2] as OrbitAction,
    owner: entry.owner,
    enabled: entry.enabled,
    tenantId: tenantId,
  }));
  if (enabledOnly) {
    return rows.filter((row) => row.enabled);
  }
  return rows;
};

const trendFromMetrics = (payload: StressWorkbenchPayload): string => {
  const average = payload.metrics.averageLatency;
  const activeShare = payload.metrics.routeCount
    ? payload.metrics.activeCount / Math.max(1, payload.metrics.routeCount)
    : 0;
  if (average > 3 && activeShare > 0.5) {
    return 'urgent';
  }
  if (average > 2) {
    return 'elevated';
  }
  if (activeShare > 0.2) {
    return 'watch';
  }
  return 'stable';
};

export const RecoveryCockpitTypeLevelStressMatrixPage = () => {
  const [compact, setCompact] = useState(false);
  const [showOnlyEnabled, setShowOnlyEnabled] = useState(false);
  const { payload, trend, planCount } = useRecoveryStressWorkbench(defaultTenant.tenantId);

  const rows = formatRouteRows(defaultTenant.tenantId, showOnlyEnabled);
  const trendLabel = trendFromMetrics(payload);
  const scoreCard = rows.reduce((acc, row) => {
    const key = row.enabled ? 'enabled' : 'disabled';
    if (row.owner.startsWith('planner') || row.owner.startsWith('mesh')) {
      acc.ownerCritical += row.enabled ? 2 : 1;
    }
    acc.total += 1;
    acc[key] += 1;
    return acc;
  }, {
    enabled: 0,
    disabled: 0,
    ownerCritical: 0,
    total: 0,
  });

  return (
    <main style={{ padding: 24, color: '#ebf0ff', background: '#0f1832', minHeight: '100vh' }}>
      <header style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <h1>Type-level stress matrix workspace</h1>
        <button type="button" onClick={() => setCompact((value) => !value)}>
          compact={String(compact)}
        </button>
        <button type="button" onClick={() => setShowOnlyEnabled((value) => !value)}>
          enabled={String(showOnlyEnabled)}
        </button>
      </header>
      <section style={{ marginBottom: 12 }}>
        <div>
          tenant={defaultTenant.tenantId}
          {' '}
          trend={trend}
          {' '}
          metricTrend={trendLabel}
        </div>
        <div>
          plans={planCount}
          {' '}
          active={payload.metrics.activeCount}
          {' '}
          disabled={payload.metrics.disabledCount}
          {' '}
          avg={payload.metrics.averageLatency.toFixed(2)}
        </div>
        <div>
          enabled={scoreCard.enabled}
          {' '}
          disabled={scoreCard.disabled}
          {' '}
          ownerCritical={scoreCard.ownerCritical}
          {' '}
          total={scoreCard.total}
        </div>
      </section>

      <StressBinaryFlowPanel compact={compact} />
      <div style={{ marginTop: 12 }}>
        <StressInstantiationWorkbench compact={compact} />
      </div>
      <section style={{ marginTop: 12 }}>
        <StressWorkbenchPanel payload={payload} />
      </section>

      <section style={{ marginTop: 12 }}>
        <h3>Route matrix</h3>
        <StressRouteMatrix
          buckets={rows.map((row) => ({
            id: row.id as OrbitRoute,
            action: row.action,
            enabled: row.enabled,
            owner: row.owner,
          }))}
          search={compact ? 'agent' : 'mesh'}
        />
      </section>
    </main>
  );
};
