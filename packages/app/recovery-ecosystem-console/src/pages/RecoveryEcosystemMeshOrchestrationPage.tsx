import { FormEvent, useCallback, useState } from 'react';
import type { MeshPluginDefinition, EcosystemEvent } from '@domain/recovery-ecosystem-orchestrator-core';
import { useEcosystemMeshOrchestrator } from '../hooks/useEcosystemMeshOrchestrator';
import { OrchestrationAtlasBoard } from '../components/mesh/OrchestrationAtlasBoard';
import { OrchestrationMeshTopology } from '../components/mesh/OrchestrationMeshTopology';
import { OrchestrationPolicyDeck } from '../components/mesh/OrchestrationPolicyDeck';
import { OrchestrationRunConsole } from '../components/mesh/OrchestrationRunConsole';
import { createMeshService } from '../services/meshOrchestrationService';
import type { TenantId, WorkspaceId } from '@domain/recovery-ecosystem-orchestrator-core';

interface PageProps {
  readonly plugins: readonly MeshPluginDefinition[];
}

export const RecoveryEcosystemMeshOrchestrationPage = (props: PageProps) => {
  const tenantId = 'tenant:mesh-dashboard' as TenantId;
  const workspaceId = 'workspace:recovery-ecosystem' as WorkspaceId;
  const service = createMeshService(props.plugins);
  const { runState, snapshot, run, clear } = useEcosystemMeshOrchestrator<Record<string, unknown>>(props.plugins, tenantId, workspaceId);
  const [payload, setPayload] = useState('{"signal":"health-check"}');

  const onSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const next = JSON.parse(payload) as Record<string, unknown>;
      await run(next);
      await service.getSnapshot();
    },
    [payload, run, service],
  );

  return (
    <main>
      <h1>Recovery Ecosystem Mesh Orchestration</h1>
      <OrchestrationAtlasBoard plugins={props.plugins} tenantId={tenantId} workspaceId={workspaceId} />
      <OrchestrationPolicyDeck plugins={props.plugins} />
      <OrchestrationMeshTopology plugins={props.plugins} />
      <section>
        <form onSubmit={onSubmit}>
          <label>
            Scenario JSON
            <br />
            <textarea
              value={payload}
              rows={6}
              cols={80}
              onChange={(next) => setPayload(next.target.value)}
            />
          </label>
          <div>
            <button type="submit">Run Mesh Orchestration</button>
            <button type="button" onClick={clear}>Clear</button>
          </div>
        </form>
      </section>
      <section>
        <h2>Execution</h2>
        <p>
          Run: {runState.runId || 'n/a'} — {runState.status}
        </p>
        <p>Stages: {snapshot.stageOrder.join(' -> ')}</p>
        <p>{runState.history.join(' | ')}</p>
        {runState.lastError ? <p>error: {runState.lastError}</p> : null}
      </section>
      <OrchestrationRunConsole events={runState.events as readonly EcosystemEvent[]} />
    </main>
  );
};
