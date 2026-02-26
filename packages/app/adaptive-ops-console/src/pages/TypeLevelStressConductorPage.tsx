import { useState } from 'react';
import { TypeLevelConductorPanel } from '../components/stress-lab/TypeLevelConductorPanel';

const defaultTenant = 'blueprint-north';

export const TypeLevelStressConductorPage = () => {
  const [lastRefresh, setLastRefresh] = useState<string>(
    new Date().toISOString(),
  );

  return (
    <main className="type-level-stress-conductor-page">
      <header>
        <h2>Type-Level Stress Conductor</h2>
        <p>Last refresh: {lastRefresh}</p>
      </header>

      <TypeLevelConductorPanel
        defaultTenant={defaultTenant}
        onRefresh={() => {
          setLastRefresh(new Date().toISOString());
        }}
      />

      <section className="notes">
        <h3>Runtime Notes</h3>
        <ol>
          <li>Type-level heavy route parsing across domain, verb and severity unions.</li>
          <li>Distributive conditional and mapped template expansions are exercised each run.</li>
          <li>Nested class, tuple, and recursive generic code paths are continuously refreshed.</li>
        </ol>
      </section>

      <section>
        <h3>Guardrail Matrix</h3>
        <ul>
          <li>No intersection chains longer than 3 members in new files.</li>
          <li>Disjoint property constraints are maintained on all synthetic carriers.</li>
          <li>Control path covers iterative branch transitions and recursive template handling.</li>
        </ul>
      </section>
    </main>
  );
};
