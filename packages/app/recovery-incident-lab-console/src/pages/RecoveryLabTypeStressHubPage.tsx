import { type ReactElement } from 'react';
import { RecoveryLabTypeStressWorkbench } from '../components/RecoveryLabTypeStressWorkbench';
import { hyperDispatchCatalog, type MatrixResult } from '@domain/recovery-lab-synthetic-orchestration';

export const RecoveryLabTypeStressHubPage = (): ReactElement => {
  const matrix = hyperDispatchCatalog as MatrixResult;
  const checks = matrix.checks.slice(0, 8);
  const digestCount = matrix.routeMapDigest.length;

  return (
    <main className="recovery-lab-type-stress-hub-page">
      <h1>Type Stress Hub Dashboard</h1>
      <p>Type-level stress orchestration cockpit with mapped signatures, recursive diagnostics, and branch fan-out.</p>
      <section>
        <h2>Catalog digest</h2>
        <p>
          {checks.length} checks · {digestCount} dispatch nodes
        </p>
        <ul>
          {checks.map((check) => (
            <li key={check}>{check}</li>
          ))}
        </ul>
      </section>
      <RecoveryLabTypeStressWorkbench />
    </main>
  );
};
