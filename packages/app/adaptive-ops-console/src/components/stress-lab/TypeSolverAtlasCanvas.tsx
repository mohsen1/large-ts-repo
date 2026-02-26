import { useMemo, useState } from 'react';
import { useTypeSolverStressLab } from '../../hooks/useTypeSolverStressLab';

export const TypeSolverAtlasCanvas = () => {
  const { snapshots, supportedPhases, routeProfiles, sampleRoutes, error, isBusy, solverResult } = useTypeSolverStressLab();
  const [selectedPhase, setSelectedPhase] = useState<string>(supportedPhases[1]);

  const routeKeys = useMemo(() => Object.keys(routeProfiles), [routeProfiles]);
  const phaseSummary = useMemo(() => {
    return sampleRoutes.reduce<Record<string, number>>((acc, value) => {
      acc[value] = (acc[value] ?? 0) + 1;
      return acc;
    }, {});
  }, [sampleRoutes]);

  return (
    <section className="type-solver-atlas-canvas">
      <h3>Type Solver Atlas Canvas</h3>
      <section>
        <label htmlFor="phase-switch">Phase</label>
        <select
          id="phase-switch"
          value={selectedPhase}
          onChange={(event) => {
            setSelectedPhase(event.target.value);
          }}
        >
          {supportedPhases.map((phase) => (
            <option key={phase} value={phase}>
              {phase}
            </option>
          ))}
        </select>
      </section>
      <section>
        <h4>Solver Snapshot</h4>
        <ul>
          <li>Total records: {snapshots.solverSnapshot.total}</li>
          <li>Completed: {snapshots.solverSnapshot.completed}</li>
          <li>Hub macros: {snapshots.hubRegistry.macros.length}</li>
          <li>Hub hydra: {snapshots.hubRegistry.hydra.length}</li>
          <li>Solver result value: {solverResult?.value}</li>
          <li>Busy: {String(isBusy)}</li>
          <li>Orbit Score: {snapshots.orbitScore}</li>
        </ul>
        {error ? <p role="alert">{error}</p> : null}
      </section>
      <section>
        <h4>Route Profile Heat</h4>
        <ol>
          {routeKeys.slice(0, 12).map((key) => {
            const profile = routeProfiles[key];
            if (!profile) {
              return null;
            }
            return (
              <li key={key}>
                {key}: {profile.verb}/{profile.domain}/{profile.severity}
              </li>
            );
          })}
        </ol>
      </section>
      <section>
        <h4>Phase Summary</h4>
        <ul>
          {Object.entries(phaseSummary).map(([phase, count]) => (
            <li key={phase}>
              {phase}: {count}
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4>Saga Trace Snippet</h4>
        <ul>
          {sampleRoutes.slice(0, 8).map((entry, index) => (
            <li key={`${entry}-${index}`}>
              {index + 1}: {entry}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
};

