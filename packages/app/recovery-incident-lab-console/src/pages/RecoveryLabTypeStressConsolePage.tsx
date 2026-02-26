import { type ReactElement } from 'react';
import { RecoveryLabTemplateControlPlane } from '../components/RecoveryLabTemplateControlPlane';
import { RecoveryLabTypeStressNavigatorPanel } from '../components/RecoveryLabTypeStressNavigatorPanel';
import { RecoveryLabTypeStressWorkbench } from '../components/RecoveryLabTypeStressWorkbench';

export const RecoveryLabTypeStressConsolePage = (): ReactElement => {
  return (
    <main className="recovery-lab-type-stress-console-page">
      <header>
        <h1>Type Stress Console</h1>
        <p>Deeply nested type stress controls with route graphs, plugin chains, and branch flow diagnostics.</p>
      </header>

      <section>
        <RecoveryLabTemplateControlPlane />
      </section>

      <section>
        <RecoveryLabTypeStressNavigatorPanel />
      </section>

      <section>
        <RecoveryLabTypeStressWorkbench />
      </section>
    </main>
  );
};
