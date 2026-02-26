import { useMemo, useState } from 'react';
import { StressTypeSolverPanel } from '../components/stress/StressTypeSolverPanel';
import { RouteDisciplineMatrix } from '../components/stress/RouteDisciplineMatrix';
import { stressRouteSamples, type DomainRoute, type RouteRecord, parseRoute, routeKinds } from '@shared/type-level/stress-conditional-depth-grid';
import { buildSolverFactory, invocationCatalog, makeInvocationTuple, solveWithConstraint } from '@domain/recovery-lab-synthetic-orchestration';
import { useStressTypeSolver } from '../hooks/useStressTypeSolver';
import { useEffect, useMemo as useMemoHook } from 'react';

type Severity = 'low' | 'medium' | 'high' | 'critical' | 'emergency';
type SimulationMode = 'preview' | 'replay' | 'stress';

type MatrixBlock = {
  readonly domain: string;
  readonly severity: Severity;
  readonly attempts: readonly string[];
  readonly score: number;
};

type SolverState = {
  readonly mode: SimulationMode;
  readonly blocks: readonly MatrixBlock[];
  readonly isBusy: boolean;
  readonly status: string;
  readonly diagnostics: readonly string[];
};

import { buildRoutePipeline } from '@shared/type-level/stress-conditional-depth-grid';

const severityOrder: readonly Severity[] = ['low', 'medium', 'high', 'critical', 'emergency'];
const attemptModes: readonly SimulationMode[] = ['preview', 'replay', 'stress'];

const computeBlock = (route: DomainRoute, mode: SimulationMode, seed: number): MatrixBlock => {
  const severity = severityOrder[(route.length + seed) % severityOrder.length]!;
  const parts = route.split('/').filter(Boolean);
  const attempts = [
    `${parts[0]}-${seed}`,
    `${parts[1]}-${seed + 1}`,
    `${parts[2]}-${seed + 2}`,
  ];
  const score = attempts.length * (mode === 'stress' ? 3 : mode === 'replay' ? 2 : 1) + seed;
  return {
    domain: parts[0],
    severity,
    attempts,
    score,
  };
};

const routeState = (route: DomainRoute): RouteRecord<DomainRoute> => ({
  id: `route:${route}`,
  source: route,
  pipeline: buildRoutePipeline(route, 12),
  payload: {
    kind: 'routed',
    domain: 'network',
    verb: 'discover',
    severity: 'low',
    entity: { left: 'x', right: 'unknown', normalized: 'x-unknown' },
    raw: route,
    parts: [route.split('/')[1] as 'discover', route.split('/')[1] as 'discover', route.split('/')[2] as 'low', 'route'] as const,
  } as unknown as RouteRecord<DomainRoute>['payload'],
  index: route.length,
  trace: [route],
});

const seedDiagnostics = (seeds: readonly MatrixBlock[]) => {
  const out: string[] = [];
  const queue: string[] = [];
  for (const seed of seeds) {
    queue.push(`${seed.domain}:${seed.severity}:${seed.score}`);
    if (seed.score > 8) {
      out.push(`high:${seed.domain}:${seed.attempts.length}`);
    } else {
      out.push(`low:${seed.domain}:${seed.severity}`);
    }
  }
  return out;
};

export const RecoveryStressTypeOpsPage = () => {
  const [mode, setMode] = useState<SimulationMode>('preview');
  const [attempt, setAttempt] = useState(2);
  const { traces } = useStressTypeSolver({ mode, attempts: attempt });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('ready');

  const blocks: readonly MatrixBlock[] = useMemo(() => {
    return stressRouteSamples.map((route, index) => computeBlock(route as DomainRoute, mode, attempt + index));
  }, [mode, attempt]);

  const diagnostics = useMemo(() => seedDiagnostics(blocks), [blocks]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setBusy(true);
      setStatus('analyzing');
      const active = [...routeKinds.keys()].slice(0, 3);
      const routeBundle = makeInvocationTuple(...active);
      await solveWithConstraint('recovery-lab', active as never);
      await buildSolverFactory('diagnose', active.join('|'), 'ok', { confidence: 1 }, { routeBundle: routeBundle.joined });
      const constraint = await solveWithConstraint('recovery-lab', ['discover', 'assess', 'notify'] as const);
      if (!cancelled) {
        setBusy(false);
        setStatus(`constraints-${constraint.domain}-${constraint.chain.signature}`);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [mode, attempt]);

  const summary = useMemoHook(() => {
    const low = blocks.filter((block) => block.severity === 'low').length;
    const high = blocks.filter((block) => block.severity === 'critical' || block.severity === 'emergency').length;
    return { low, high, total: blocks.length };
  }, [blocks]);

  const routeStates = useMemoHook(() => stressRouteSamples.slice(0, 5).map((route) => routeState(route)), [traces.length]);

  return (
    <main style={{ padding: 16, display: 'grid', gap: 16 }}>
      <header style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <h2>Recovery Stress Type Ops</h2>
        <select value={mode} onChange={(event) => setMode(event.currentTarget.value as SimulationMode)}>
          {attemptModes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <input type="number" min={1} max={20} value={attempt} onChange={(event) => setAttempt(Number(event.currentTarget.value))} />
        <button type="button" onClick={() => setAttempt((current) => current + 1)}>
          Bump attempts
        </button>
      </header>
      <section>
        <p>
          blocks: {summary.total} low: {summary.low} high: {summary.high} status: {status} | busy {busy ? 'yes' : 'no'} traces {traces.length}
        </p>
        <p>catalog {invocationCatalog.checksum ? 'active' : 'idle'} mode {mode}</p>
      </section>
      <RouteDisciplineMatrix maxRows={36} maxCols={3} filterSeverity={mode === 'stress' ? 'critical' : undefined} />
      <StressTypeSolverPanel mode={mode} attempts={attempt} />
      <section style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 8 }}>
        <h3>Route Traces</h3>
        <ul>
          {routeStates.map((row) => (
            <li key={row.id}>
              {row.id} | {row.source} | {row.pipeline.length} | {row.trace.at(-1)}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h3>Diagnostics</h3>
        <div style={{ maxHeight: 180, overflowY: 'auto' }}>
          {diagnostics.map((diagnostic) => (
            <p key={diagnostic}>{diagnostic}</p>
          ))}
        </div>
      </section>
      <pre style={{ fontSize: 12, overflow: 'auto', maxHeight: 220, border: '1px solid #e5e7eb' }}>
        {JSON.stringify({ invocationCatalog, blocks: blocks.slice(0, 3) }, null, 2)}
      </pre>
    </main>
  );
};
