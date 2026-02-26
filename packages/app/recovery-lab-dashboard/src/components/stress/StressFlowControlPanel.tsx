import { useMemo, useState } from 'react';
import {
  compileFlowRun,
  summarizeFlow,
  dispatchFlow,
  runFlowScenario,
  type FlowMode,
} from '@domain/recovery-lab-synthetic-orchestration/compiler-controlflow-labyrinth';
import { hyperUnionCatalog } from '@shared/type-level/stress-hyper-union';
import { evaluateFlow } from '@shared/type-level/stress-flow-labyrinth';
import type { FlowInput } from '@shared/type-level/stress-flow-labyrinth';

type StressPanelState = {
  readonly total: number;
  readonly resolved: number;
  readonly escalated: number;
};

export const StressFlowControlPanel = (): React.JSX.Element => {
  const [routeCount, setRouteCount] = useState<number>(15);
  const [mode, setMode] = useState<FlowMode>('preview');

  const seededRoutes = useMemo(() => hyperUnionCatalog.slice(0, routeCount), [routeCount]);
  const scenario = useMemo(() => runFlowScenario(seededRoutes as never), [seededRoutes]);
  const compiled = useMemo(() => compileFlowRun(seededRoutes as never, mode), [seededRoutes, mode]);
  const summary = useMemo(() => summarizeFlow(compiled), [compiled]);

  const flowSamples = useMemo(() => {
    const input = seededRoutes[0] ? ({
      kind: 1,
      route: seededRoutes[0],
      attempt: 2,
      severity: 'low',
    } satisfies FlowInput) : ({ kind: 1, route: seededRoutes[0] ?? 'incident:discover:low:id-a', attempt: 1, severity: 'low' } as FlowInput);
    return [evaluateFlow(input), ...compiled.slice(0, 4).map((entry) => entry.direct)];
  }, [seededRoutes, compiled]);

  const metrics = useMemo((): StressPanelState => {
    const values = Object.values(summary) as number[];
    const total = values.reduce((acc, value) => acc + value, 0);
    const resolved = values.findIndex((value) => value > 0) >= 0 ? total : 0;
    const escalated = Object.entries(summary)
      .filter(([status]) => status.includes('escalate')).length;
    return { total, resolved, escalated };
  }, [summary]);

  const randomMode = (): FlowMode => ['preview', 'probe', 'recover', 'audit'][Math.floor(Math.random() * 4)] as FlowMode;
  const runDispatch = () => {
    const route = seededRoutes[Math.floor(Math.random() * seededRoutes.length)] as never;
    const attempted = Math.max(1, Math.floor(routeCount / 2));
    const active = dispatchFlow(route, attempted, randomMode());
    return active;
  };

  return (
    <section style={{ display: 'grid', gap: 10 }}>
      <header>
        <h3>Stress Flow Control Panel</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" onClick={() => setRouteCount((current) => Math.max(1, current - 1))}>
            -
          </button>
          <span>{routeCount}</span>
          <button type="button" onClick={() => setRouteCount((current) => current + 1)}>
            +
          </button>
          <button type="button" onClick={() => setMode('preview')}>
            Preview
          </button>
          <button type="button" onClick={() => setMode('probe')}>
            Probe
          </button>
          <button type="button" onClick={() => setMode('recover')}>
            Recover
          </button>
          <button type="button" onClick={() => setMode('audit')}>
            Audit
          </button>
          <button type="button" onClick={runDispatch}>
            Dispatch
          </button>
        </div>
      </header>
      <p>status: {Object.keys(summary).join(', ') || 'none'}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        <article style={{ border: '1px solid #cbd5e1', padding: 8 }}>
          <h4>Total Score</h4>
          <strong>{metrics.total}</strong>
        </article>
        <article style={{ border: '1px solid #cbd5e1', padding: 8 }}>
          <h4>Resolved Buckets</h4>
          <strong>{metrics.resolved}</strong>
        </article>
        <article style={{ border: '1px solid #cbd5e1', padding: 8 }}>
          <h4>Escalations</h4>
          <strong>{metrics.escalated}</strong>
        </article>
      </div>
      <div style={{ display: 'grid', gap: 6 }}>
        {flowSamples.map((sample, index) => (
          <p key={`${sample.reason}-${index}`} style={{ margin: 0 }}>
            {index}: {sample.status} / {sample.reason} / {sample.route}
          </p>
        ))}
      </div>
      <pre style={{ background: '#f8fafc', padding: 10, borderRadius: 8, overflowX: 'auto' }}>
        {JSON.stringify({ scenarioBranches: scenario.topBranches }, null, 2)}
      </pre>
    </section>
  );
};
