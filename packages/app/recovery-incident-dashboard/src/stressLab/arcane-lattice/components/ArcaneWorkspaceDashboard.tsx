import { useCallback, useMemo } from 'react';
import type { ArcanePlugin, ArcanePluginKind } from '../types';
import { ArcanePluginConsole } from './ArcanePluginConsole';
import { ArcaneTimelinePanel } from './ArcaneTimelinePanel';
import type { ArcaneRunFrame } from '../runtime';
import { summarizeRuntimeEvents } from '../runtime';
import type { ArcaneCatalogMap } from '../types';

interface ArcaneWorkspaceDashboardProps {
  readonly frame: ArcaneRunFrame<readonly ArcanePlugin[]>;
  readonly catalog: ArcaneCatalogMap<readonly ArcanePlugin[]>;
  readonly catalogSummary: readonly string[];
  readonly selectedKinds: readonly ArcanePluginKind[];
  readonly timeline: readonly string[];
  readonly loading: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onToggleKind: (kind: ArcanePluginKind) => void;
  readonly onRefresh: () => void;
}

export const ArcaneWorkspaceDashboard = ({
  frame,
  catalog,
  catalogSummary,
  selectedKinds,
  timeline,
  loading,
  onStart,
  onStop,
  onToggleKind,
  onRefresh,
}: ArcaneWorkspaceDashboardProps) => {
  const diagnostic = useMemo(() => summarizeRuntimeEvents(frame), [frame]);
  const counts = useMemo(() => catalogSummary.join(' / '), [catalogSummary]);

  const runAction = useCallback(() => {
    onStart();
  }, [onStart]);

  const stopAction = useCallback(() => {
    onStop();
  }, [onStop]);

  return (
    <main className="arcane-dashboard">
      <header>
        <h2>Arcane Studio Dashboard</h2>
        <p>
          Workspace {frame.workspace.workspaceId} · session {frame.activeSession}
        </p>
        <p>Selected kinds: {selectedKinds.join(' | ') || 'none'}</p>
        <p>Catalog entries: {counts || 'empty'}</p>
        <div>
          <button type="button" onClick={runAction}>
            Start
          </button>
          <button type="button" onClick={stopAction} disabled={loading}>
            Stop
          </button>
        </div>
      </header>

      <ArcanePluginConsole catalog={frame.registry.manifest()} selectedKinds={selectedKinds} onToggleKind={onToggleKind} />

      <ArcaneTimelinePanel
        workspace={frame.workspace}
        timeline={timeline}
        loading={loading}
        onRefresh={onRefresh}
      />

      <section>
        <h3>Diagnostics</h3>
        <ul>
          {diagnostic.length === 0 ? <li>No diagnostics.</li> : diagnostic.map((entry) => <li key={entry}>{entry}</li>)}
        </ul>
      </section>
    </main>
  );
};
