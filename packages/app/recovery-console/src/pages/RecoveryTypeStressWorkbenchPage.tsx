import { type ReactElement } from 'react';
import { TypeStressWorkspacePanel } from '../features/recovery-type-stress/components/TypeStressWorkspacePanel';

interface Props {
  readonly tenant: string;
}

export const RecoveryTypeStressWorkbenchPage = ({ tenant }: Props): ReactElement => {
  const tenants = ['tenant-alpha', 'tenant-beta', 'tenant-gamma'] as const;

  return (
    <main className="recovery-type-stress-workbench-page">
      <header>
        <h1>Recovery Type Stress Workbench</h1>
        <p>Advanced checker stress harness for compiler and domain types.</p>
      </header>
      <section className="tenant-tabs">
        {tenants.map((currentTenant) => (
          <article key={currentTenant}>
            <h2>{currentTenant}</h2>
            <TypeStressWorkspacePanel tenant={currentTenant === 'tenant-alpha' ? tenant : currentTenant} />
          </article>
        ))}
      </section>
    </main>
  );
};
