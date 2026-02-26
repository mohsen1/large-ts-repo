import { useMemo, useState } from 'react';
import { StressTypePolicyPanel } from '../components/StressTypePolicyPanel';
import { useRecoveryStressTypeOps } from '../hooks/useRecoveryStressTypeOps';

export const RecoveryLabStressTypeOpsPage = (): React.JSX.Element => {
  const state = useRecoveryStressTypeOps();
  const [selected, setSelected] = useState('recover');

  const metrics = useMemo(
    () => ({
      total: state.profile.total,
      unique: state.signatures.length,
      active: state.profile.hasRoute,
    }),
    [state.profile.total, state.signatures.length, state.profile.hasRoute],
  );

  return (
    <main style={{ display: 'grid', gap: 12, padding: 16 }}>
      <h1>Recovery Stress Type Ops</h1>
      <section style={{ border: '1px solid #e1e4ec', padding: 12, borderRadius: 8 }}>
        <h2>Overview</h2>
        <p>
          total routes: {metrics.total}, signatures: {metrics.unique}, has route constraint: {`${state.profile.hasRoute}`}
        </p>
        <p>{`selected-domain:${selected}`}</p>
        {state.loadError ? <p style={{ color: 'red' }}>{state.loadError.message}</p> : null}
      </section>
      <section style={{ border: '1px solid #e1e4ec', padding: 12, borderRadius: 8 }}>
        <h2>Catalog Distribution</h2>
        <ul>
          {Object.entries(state.profile.byDomain).map(([name, total]) => (
            <li key={name}>
              <button type="button" onClick={() => setSelected(name)}>
                {name}: {total}
              </button>
            </li>
          ))}
        </ul>
      </section>
      <StressTypePolicyPanel
        rows={state.catalogRows}
        signatures={state.signatures}
        signaturesByNoInfer={state.view.signaturesByNoInfer}
        onInspect={(route) => setSelected(route)}
      />
      <section style={{ border: '1px solid #e1e4ec', padding: 12, borderRadius: 8 }}>
        <h3>Resolved Sample</h3>
        <ul>
          <li>loading: {`${state.loading}`}</li>
          <li>resolved keys: {Object.keys(state.resolved).length}</li>
          <li>signatures by verb: {state.view.rows.length}</li>
        </ul>
      </section>
    </main>
  );
};
