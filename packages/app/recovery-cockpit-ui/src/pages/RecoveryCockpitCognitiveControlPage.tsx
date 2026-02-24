import { useMemo } from 'react';
import { CognitiveSignalGrid } from '../components/cognitive/CognitiveSignalGrid';
import { CognitiveSignalTopology } from '../components/cognitive/CognitiveSignalTopology';
import { CognitiveScenarioPanel } from '../components/cognitive/CognitiveScenarioPanel';

export interface RecoveryCockpitCognitiveControlPageProps {
  readonly tenantId: string;
  readonly workspaceId: string;
}

const controlHeader = (tenantId: string, workspaceId: string) => (
  <header>
    <h1>Recovery Cockpit Cognitive Control</h1>
    <p>
      {tenantId}
      {' '}
      /
      {' '}
      {workspaceId}
    </p>
  </header>
);

export const RecoveryCockpitCognitiveControlPage = ({
  tenantId,
  workspaceId,
}: RecoveryCockpitCognitiveControlPageProps) => {
  const key = useMemo(() => `${tenantId}:${workspaceId}`, [tenantId, workspaceId]);

  return (
    <main>
      {controlHeader(tenantId, workspaceId)}
      <section>
        <CognitiveScenarioPanel tenantId={tenantId} workspaceId={workspaceId} />
      </section>
      <section key={key}>
        <CognitiveSignalGrid
          tenantId={tenantId}
          workspaceId={workspaceId}
          onRefresh={() => {
            // no-op hook side-effect intentionally centralized in grid.
          }}
        />
      </section>
      <section>
        <CognitiveSignalTopology tenantId={tenantId} workspaceId={workspaceId} />
      </section>
    </main>
  );
};
