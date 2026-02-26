import { useState } from 'react';
import { StressRouteMatrix } from '../components/stress/StressRouteMatrix';
import { useRecoveryStressWorkbench } from '../hooks/useRecoveryStressWorkbench';
import { StressWorkbenchPanel } from '../components/stress/StressWorkbenchPanel';
import {
  resolveWorkbenchInput,
  summarizeMetrics,
  type StressWorkbenchInput,
} from '../services/recoveryCockpitStressWorkloadService';
import type { OrbitAction } from '@shared/type-level';

const defaultTenant = resolveWorkbenchInput('tenant-stress-0001');

const computeBaseline = (payload: StressWorkbenchInput, pattern: string): number => {
  const keys = Object.keys(payload.routeMap) as Array<keyof typeof payload.routeMap>;
  let baseline = payload.baseline;
  const [head, ...tail] = keys;
  for (const key of keys) {
    const record = payload.routeMap[key];
    const active = record.enabled ? 1 : 0;
    baseline += key.length + record.owner.length + record.route.length + active;
    if (key.startsWith('stress-run') && key.includes(pattern)) {
      baseline += 100;
    }
    if (record.route.includes('mesh') || record.route.includes('telemetry')) {
      baseline += 3;
    }
  }
  if (head && tail.length) {
    baseline += head.length + tail.length;
  }
  return baseline;
};

const complexityBuckets = (baseline: number): string[] => {
  const values: string[] = [];
  for (let index = 0; index < 40; index += 1) {
    values.push(`${index % 2 === 0 ? 'even' : 'odd'}-${baseline + index}`);
  }
  return values;
};

const routeSearchChain = (seed: string, rounds: number): string => {
  let value = seed;
  for (let index = 0; index < rounds; index += 1) {
    value = `${value}.${index}-${seed}`;
  }
  return value;
};

const evaluateFilter = (bucket: string, query: string): boolean => bucket.includes(query);

export const RecoveryCockpitTypeLevelStressPage = () => {
  const tenant = defaultTenant.tenantId;
  const { payload, trend, planCount } = useRecoveryStressWorkbench(tenant);
  const [search, setSearch] = useState('');
  const [toggle, setToggle] = useState(true);
  const metrics = summarizeMetrics(payload.result);
  const baseline = computeBaseline(defaultTenant, search);
  const buckets = complexityBuckets(baseline);
  const searchValue = routeSearchChain(search || 'seed', 3);
  const filteredBuckets = buckets.filter((bucket) => evaluateFilter(bucket, search));
  const derived = filteredBuckets.map((bucket) => `${searchValue}-${bucket}`);
  return (
    <main style={{ padding: 24, color: '#ebf0ff', background: '#081022', minHeight: '100vh' }}>
      <h1>Type-level stress cockpit</h1>
      <section style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => setToggle((value) => !value)}
          style={{ borderRadius: 8 }}
        >
          Toggle panel
        </button>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="filter routes"
          style={{ borderRadius: 8, border: '1px solid #3e4b78', color: '#0b1024', padding: 6 }}
        />
      </section>
      <section>
        <div style={{ marginBottom: 8 }}>
          Trend {trend} | plans {planCount} | route count {payload.metrics.routeCount}
        </div>
        <div style={{ fontSize: 12, marginBottom: 12 }}>
          baseline: {baseline} | metrics avg={metrics.averageLatency.toFixed(2)}
        </div>
        <div style={{ marginBottom: 8 }}>
          derived buckets: {derived.slice(0, 4).join(' | ')}
        </div>
      </section>
      {toggle ? <StressWorkbenchPanel payload={payload} /> : null}
      <StressRouteMatrix
        buckets={defaultTenant.routeMap
          ? Object.values(defaultTenant.routeMap).map((route) => ({
            id: route.route,
            action: route.route.split('/')[2] as OrbitAction,
            enabled: route.enabled,
            owner: route.owner,
          }))
          : []}
        search={searchValue}
      />
      <section style={{ marginTop: 12 }}>
        <h3>Stress trend trail</h3>
        <ol>
          {derived.map((entry) => (
            <li key={entry}>
              {entry}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
};
