import { useMemo, useState } from 'react';
import { useTypeLevelStressBench } from '../hooks/useTypeLevelStressBench';
import { TypeSolverPlaybook } from '../components/stress/TypeSolverPlaybook';
import { RouteTopologyCanvas, routePalette } from '../components/stress/RouteTopologyCanvas';
import { evaluateBinaryExpression, type BranchRoutes, type BranchSolver } from '@domain/recovery-lab-synthetic-orchestration/compiler-branching-lattice';
import {
  solverInvocationSuite,
  type SolverResult,
  type ChainResult,
} from '@domain/recovery-lab-synthetic-orchestration/compiler-instantiation-matrix';

const binaryOps = ['&&', '||', '>=', '<=', '===', '??'] as const;
const branchOptions = [
  'incident.discover.critical',
  'incident.assess.critical',
  'telemetry.notify.warning',
  'workflow.restore.low',
  'risk.triage.medium',
  'policy.audit.medium',
] as const satisfies readonly BranchRoutes[];

export const RecoveryStressTypeArenaPage = (): React.JSX.Element => {
  const {
    state,
    mapped,
    bundles,
    trace,
    run,
    updateMode,
    appendRoute,
    removeRoute,
    clearRoutes,
    changeSeed,
  } = useTypeLevelStressBench();
  const [seed, setSeed] = useState('arena-seed');
  const [index, setIndex] = useState(0);
  const [left, setLeft] = useState(5);
  const [right, setRight] = useState(3);
  const [solverChecksum, setSolverChecksum] = useState(0);

  const selectedRoute = state.routes[index % state.routes.length] ?? state.routes[0] ?? branchOptions[0];
  const palette = useMemo(() => routePalette(branchOptions), []);
  const dispatchRows = useMemo(() => trace().slice(0, 120).map((entry) => entry.split(':')), [state.routes, trace]);

  const binaryReport = useMemo(
    () => binaryOps.map((operator) => {
      const result = evaluateBinaryExpression(left, right, operator as '&&');
      return `${result.expression} = ${String(result.value)}`;
    }),
    [left, right],
  );

  const diagnostics = bundles
    .toSorted((leftEntry, rightEntry) => rightEntry.index - leftEntry.index)
    .filter((entry) => entry.active)
    .slice(0, 16);

  const unionRows = useMemo(() => {
    const raw = state.dispatches.slice(0, 24).map((entry, row) => `${row}:${entry.event}`);
    return raw.toSorted();
  }, [state.dispatches]);

  const invokeSolver = async () => {
    const result = await solverInvocationSuite();
    setSolverChecksum((result.checksum as number) ?? 0);
  };

  const nodes = useMemo(() => {
    const entries = Object.entries(state.routes).map(([index, route]) => `${index}-${route}`);
    return entries.join('|');
  }, [state.routes]);

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <header>
        <h1>Recovery Stress Type Arena</h1>
        <p>solver checksum: {solverChecksum}</p>
        <p>route sample: {selectedRoute}</p>
      </header>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Mode controls</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <button type="button" onClick={() => updateMode('fast')}>fast</button>
            <button type="button" onClick={() => updateMode('thorough')}>thorough</button>
          </div>
          <label>
            seed
            <input
              value={seed}
              onChange={(event) => {
                const next = event.target.value;
                setSeed(next);
                changeSeed(next);
              }}
            />
          </label>
          <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
            <button type="button" onClick={() => void run()}>run suite</button>
            <button type="button" onClick={() => removeRoute(selectedRoute)}>remove selected</button>
            <button type="button" onClick={clearRoutes}>clear routes</button>
            <button type="button" onClick={() => appendRoute(branchOptions[index % branchOptions.length])}>append branch</button>
            <button type="button" onClick={invokeSolver}>invoke solver</button>
          </div>
          <p>routes={state.routes.length}</p>
          <p>mode={state.mode}</p>
          <p>score={state.score}</p>
        </article>

        <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>Binary expression stress</h3>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input type="number" value={left} onChange={(event) => setLeft(Number(event.target.value))} />
            <input type="number" value={right} onChange={(event) => setRight(Number(event.target.value))} />
          </div>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {binaryReport.map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
          </ul>
        </article>
      </section>

      <RouteTopologyCanvas
        routes={state.routes}
        selected={selectedRoute}
        onSelect={(next) => {
          const indexOfRoute = state.routes.indexOf(next as BranchRoutes);
          setIndex(indexOfRoute >= 0 ? indexOfRoute : 0);
        }}
        onTrace={(route) => {
          const tokens = route.toUpperCase().split('.');
          if (mapped.has(route)) {
            setSeed(tokens.join('-'));
          }
        }}
      />

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>dispatch trace</h3>
          <ul style={{ margin: 0, paddingLeft: 16, maxHeight: 220, overflowY: 'auto' }}>
            {dispatchRows.map(([idx, event, outcome]) => (
              <li key={`${idx}-${event}`}>
                {idx}:{event}:{outcome}
              </li>
            ))}
          </ul>
        </article>

        <article style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
          <h3>diagnostics</h3>
          <ul style={{ margin: 0, paddingLeft: 16 }}>
            {diagnostics.map((entry) => (
              <li key={`${entry.route}-${entry.index}`}>{entry.solver}</li>
            ))}
          </ul>
        </article>
      </section>

      <section style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 12 }}>
        <h3>palette</h3>
        <ul style={{ margin: 0, paddingLeft: 16 }}>
          {palette.map((entry) => (
            <li key={entry.id}>
              {entry.id} ({entry.weight})
            </li>
          ))}
        </ul>
      </section>

      <TypeSolverPlaybook
        title="solver playbook"
        solver={mapped as unknown as SolverResult}
        chain={mapped as unknown as ChainResult}
        nodes={Array.from(mapped.entries()).map(([route, value]) => ({
          input: `${route}` as BranchSolver<string, string>['input'],
          output: `${value}` as BranchSolver<string, string>['output'],
          score: String(value).length,
        }))}
        active={state.dispatches.length > 0}
      />

      <section>
        <h3>union map</h3>
        <pre>{JSON.stringify({ nodes, bundles: bundles.length }, null, 2)}</pre>
      </section>
      <section>
        <h3>raw dispatch keys</h3>
        <pre>{unionRows.join('\n')}</pre>
      </section>
    </main>
  );
};
