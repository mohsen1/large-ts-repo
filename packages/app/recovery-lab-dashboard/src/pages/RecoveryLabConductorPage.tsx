import type { FC } from 'react';
import { useRecoveryLabConductor } from '../hooks/useRecoveryLabConductor';
import { RecoveryLabConductorPanel } from '../components/RecoveryLabConductorPanel';
import { RecoveryLabSignalForecastPanel } from '../components/RecoveryLabSignalForecastPanel';

interface RecoveryLabConductorPageProps {
  readonly tenant: string;
  readonly workspace: string;
}

const safeList = (values: readonly string[] | undefined): readonly string[] => values ?? [];

export const RecoveryLabConductorPage: FC<RecoveryLabConductorPageProps> = ({ tenant, workspace }) => {
  const state = useRecoveryLabConductor({ tenant, workspace });

  return (
    <main style={{ padding: 16, display: 'grid', gap: 16 }}>
      <h1>Recovery lab conductor</h1>
      <RecoveryLabConductorPanel
        tenant={tenant}
        workspace={workspace}
        state={state}
        onRun={(event) => {
          void state.run(event);
        }}
      />
      <RecoveryLabSignalForecastPanel state={state} forecast={state.forecast} />
      <section style={{ border: '1px solid #ddd', borderRadius: 6, padding: 10 }}>
        <h2>Run diagnostics</h2>
        <ul>
          {safeList(state.diagnostics).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
