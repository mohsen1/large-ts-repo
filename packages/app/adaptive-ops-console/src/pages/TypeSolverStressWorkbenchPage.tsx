import { useState } from 'react';
import { TypeSolverAtlasCanvas } from '../components/stress-lab/TypeSolverAtlasCanvas';
import { TypeSolverDecisionMatrix } from '../components/stress-lab/TypeSolverDecisionMatrix';
import { useTypeSolverStressLab } from '../hooks/useTypeSolverStressLab';

export const TypeSolverStressWorkbenchPage = () => {
  const { seed, setSeed, snapshots, isBusy, routeProfiles, sampleRoutes } = useTypeSolverStressLab();
  const [tenant, setTenant] = useState(seed.tenant);
  const [score, setScore] = useState(seed.score);

  return (
    <main className="type-solver-stress-workbench-page">
      <section className="workbench-controls">
        <h2>Type Solver Stress Workbench</h2>
        <label htmlFor="solver-tenant">Tenant</label>
        <input
          id="solver-tenant"
          value={tenant}
          onChange={(event) => {
            setTenant(event.target.value);
          }}
        />
        <label htmlFor="solver-score">Score</label>
        <input
          id="solver-score"
          type="number"
          value={score}
          onChange={(event) => {
            const value = Number.parseInt(event.target.value, 10);
            const normalized = Number.isNaN(value) ? 0 : value;
            setScore(normalized);
          }}
        />
        <button
          type="button"
          onClick={() => {
            setSeed({
              tenant,
              score,
            });
          }}
        >
          Apply
        </button>
        <span>Running: {String(isBusy)}</span>
      </section>
      <section>
        <h3>State Summary</h3>
        <ul>
          <li>Current tenant: {seed.tenant}</li>
          <li>Current score: {seed.score}</li>
          <li>Solver records: {snapshots.solverSnapshot.total}</li>
          <li>Saga phases: {snapshots.sagaSnapshot.total}</li>
          <li>Completed saga phases: {snapshots.sagaSnapshot.resolved}</li>
          <li>Hub macro routes: {snapshots.hubRegistry.macros.length}</li>
          <li>Hub solver rows: {snapshots.solverRecords.length}</li>
          <li>Profile map entries: {Object.keys(routeProfiles).length}</li>
          <li>Route sample count: {sampleRoutes.length}</li>
        </ul>
      </section>
      <TypeSolverAtlasCanvas />
      <TypeSolverDecisionMatrix />
      <section>
        <h3>Sample Route Profiles</h3>
        <div>
          {Object.entries(routeProfiles)
            .slice(0, 8)
            .map(([route, profile]) => (
              <article key={route}>
                <p>{route}</p>
                <p>
                  {profile.domain} / {profile.verb} / {profile.severity}
                </p>
              </article>
            ))}
        </div>
      </section>
    </main>
  );
};

