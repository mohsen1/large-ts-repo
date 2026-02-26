import { useMemo, useState } from 'react';
import { ConstraintConflictMatrix } from '../components/stress/ConstraintConflictMatrix';
import { TypeLevelHarnessPanel } from '../components/stress/TypeLevelHarnessPanel';
import { useStressControlFabric } from '../hooks/useStressControlFabric';
import {
  seedCatalog,
  type WorkRoute,
} from '@shared/type-level/stress-conditional-union-grid';

const modeList = ['idle', 'prime', 'warm', 'execute', 'throttle', 'fallback', 'escalate', 'drain', 'verify', 'finish'] as const;

type PageMode = (typeof modeList)[number];

type ControlCard = {
  readonly route: WorkRoute;
  readonly profileScore: number;
  readonly status: 'ok' | 'warn' | 'fail';
};

export const RecoveryStressControlWorkbenchPage = (): React.JSX.Element => {
  const [count, setCount] = useState(9);
  const [mode, setMode] = useState<PageMode>('execute');
  const { state, run, toggleMode } = useStressControlFabric({
    seed: seedCatalog[0] as WorkRoute,
    count,
    domain: 'recovery',
    mode,
  });

  const controls = useMemo(() => {
    const cards: ControlCard[] = state.profiles.map((profile) => ({
      route: profile.route,
      profileScore: profile.score,
      status: profile.score > 50 ? 'ok' : profile.score > 20 ? 'warn' : 'fail',
    }));

    return cards;
  }, [state.profiles]);

  return (
    <main style={{ display: 'grid', gap: 16, padding: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Recovery Stress Control Workbench</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select value={mode} onChange={(event) => setMode(event.target.value as PageMode)}>
            {modeList.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <input
            type="number"
            min={1}
            max={25}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          />
          <button type="button" onClick={toggleMode}>
            cycle mode
          </button>
          <button type="button" onClick={() => void run()}>
            execute
          </button>
        </div>
      </header>

      <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <article style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
          <h3>Run status</h3>
          <p>mode: {state.selectedMode}</p>
          <p>status: {state.status}</p>
          <p>selected route: {state.selectedRoute}</p>
          <p>routes: {state.routes.length}</p>
        </article>
        <article style={{ border: '1px solid #cbd5e1', borderRadius: 8, padding: 12 }}>
          <h3>Route score cards</h3>
          <ul>
            {controls.map((card) => (
              <li key={card.route}>
                <span style={{ fontFamily: 'monospace' }}>{card.route}</span>
                <span style={{ marginLeft: 10 }}>score {card.profileScore}</span>
                <span style={{ marginLeft: 10, color: card.status === 'ok' ? 'green' : card.status === 'warn' ? 'orange' : 'red' }}>
                  {card.status}
                </span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <ConstraintConflictMatrix routes={state.routes} seedRoute={state.selectedRoute} />
      <TypeLevelHarnessPanel />
    </main>
  );
};
