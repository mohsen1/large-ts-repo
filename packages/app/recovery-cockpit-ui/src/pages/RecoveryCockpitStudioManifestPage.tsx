import { useMemo, useState } from 'react';
import { useStudioConductor } from '../hooks/useStudioConductor';
import { buildStudioRunMatrix, parseTenant, parseWorkspace, toManifestWindow } from '../services/studioDirectorService';
import { StudioManifestMatrix } from '../components/studio/StudioManifestMatrix';
import { StudioConductorCanvas } from '../components/studio/StudioConductorCanvas';

export const RecoveryCockpitStudioManifestPage = () => {
  const [tenant, setTenant] = useState('tenant:alpha-1');
  const [workspace, setWorkspace] = useState('workspace:alpha-1');
  const { manifest, pluginIds, ready, bootstrap } = useStudioConductor(tenant, workspace);

  const manifestWindow = useMemo(() => (manifest ? toManifestWindow(manifest) : undefined), [manifest]);
  const matrix = useMemo(() => (manifest ? buildStudioRunMatrix(manifest.pluginCatalog as never) : {}), [manifest]);

  return (
    <main style={{ padding: 18, display: 'grid', gap: 16 }}>
      <header>
        <h2>Studio manifest workspace</h2>
        <p>Inspect manifest and plugin matrix by tenant/workspace.</p>
      </header>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <label>
          Tenant
          <input value={tenant} onChange={(event) => setTenant(event.target.value)} />
        </label>
        <label>
          Workspace
          <input value={workspace} onChange={(event) => setWorkspace(event.target.value)} />
        </label>
      </section>

      <button type="button" onClick={() => void bootstrap()}>
        Reload manifest
      </button>

      <section>
        <h3>Context</h3>
        <p>Tenant parsed: {parseTenant(tenant)}</p>
        <p>Workspace parsed: {parseWorkspace(workspace)}</p>
      </section>

      <section style={{ display: 'grid', gap: 12, gridTemplateColumns: '1fr 1fr' }}>
        <StudioManifestMatrix manifest={manifest} />
        <StudioConductorCanvas pluginIds={pluginIds} />
      </section>

      <section>
        <h3>Summary</h3>
        {ready ? (
          <div>
            <p>Plugins loaded: {pluginIds.length}</p>
            {manifestWindow ? <p>Stage weights: {Object.keys(manifestWindow.stageWeights).join(', ')}</p> : null}
            <pre style={{ background: '#f1f5f9', padding: 12 }}>
              {JSON.stringify(matrix, null, 2)}
            </pre>
          </div>
        ) : (
          <p>manifest loading</p>
        )}
      </section>
    </main>
  );
};
