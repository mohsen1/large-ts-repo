import { useState, useMemo } from 'react';
import { usePlaybookStudioDashboard } from '../hooks/usePlaybookStudioDashboard';
import { usePlaybookTopologyFlow } from '../hooks/usePlaybookTopologyFlow';
import { usePlaybookStudioAudit } from '../hooks/usePlaybookStudioAudit';
import { PlaybookStudioControls } from '../components/playbook-studio/PlaybookStudioControls';
import { PlaybookStudioTopology } from '../components/playbook-studio/PlaybookStudioTopology';
import { PluginControlBoard } from '../components/playbook-studio/PluginControlBoard';
import { describeRunResult, summarizeSnapshot } from '../studio/telemetrySink';

export interface PlaybookStudioOperationsPageProps {
  tenantId: string;
  workspaceId: string;
  artifactId: string;
}

const defaultPlugins = [
  { id: 'planner', enabled: true, capabilities: ['plan', 'route'] },
  { id: 'validator', enabled: true, capabilities: ['validate', 'guard'] },
  { id: 'executor', enabled: false, capabilities: ['execute', 'rollback'] },
  { id: 'auditor', enabled: true, capabilities: ['audit', 'diff'] },
] satisfies readonly { id: string; enabled: boolean; capabilities: string[] }[];

export const PlaybookStudioOperationsPage = ({ tenantId, workspaceId, artifactId }: PlaybookStudioOperationsPageProps) => {
  const { state, run, reset } = usePlaybookStudioDashboard({
    tenantId,
    workspaceId,
    artifactId,
  });

  const topology = usePlaybookTopologyFlow(artifactId);
  const audit = usePlaybookStudioAudit({
    runId: artifactId,
    tenantId,
    workspaceId,
  });

  const [plugins, setPlugins] = useState(defaultPlugins);
  const [selectedNode, setSelectedNode] = useState(topology.nodes[0]?.id);

  const diagnostics = useMemo(() => {
    if (!state.run) {
      return {
        metricCount: 0,
        eventCount: 0,
        summary: 'No run yet',
      };
    }

    const summary = describeRunResult(state.run);
    const envelope = summarizeSnapshot(state.run.snapshot);
    return {
      metricCount: summary.tokens.length,
      eventCount: envelope.events.length,
      summary: envelope.summary,
    };
  }, [state.run]);

  const runPrepare = async () => {
    await run({
      command: 'prepare',
      tenantId,
      workspaceId,
      artifactId,
      requestedBy: 'operator',
      strategy: 'reactive',
    });
  };

  const runExecute = async () => {
    await run({
      command: 'execute',
      tenantId,
      workspaceId,
      artifactId,
      runId: state.lastRunId ?? 'run:0',
      force: true,
    });
  };

  const runAudit = async () => {
    await run({
      command: 'audit',
      tenantId,
      workspaceId,
      artifactId,
      runId: state.lastRunId ?? 'run:0',
    });
  };

  return (
    <main className="playbook-studio-operations-page">
      <h1>Recovery Playbook Studio</h1>
      <section>
        <h2>Context</h2>
        <p>Tenant: {tenantId}</p>
        <p>Workspace: {workspaceId}</p>
        <p>Artifact: {artifactId}</p>
      </section>

      <PlaybookStudioControls
        disabled={state.loading}
        onPrepare={runPrepare}
        onExecute={runExecute}
        onAudit={runAudit}
        onRefresh={() => {
          void audit.refresh();
          setPlugins([...defaultPlugins]);
          reset();
        }}
      />

      <section>
        <h2>Topology</h2>
        <PlaybookStudioTopology
          nodes={topology.nodes}
          selected={selectedNode}
          onNodeClick={setSelectedNode}
        />
      </section>

      <section>
        <h2>Runtime snapshot</h2>
        <p>{diagnostics.summary}</p>
        <dl>
          <dt>Metric count</dt>
          <dd>{diagnostics.metricCount}</dd>
          <dt>Event count</dt>
          <dd>{diagnostics.eventCount}</dd>
          <dt>Timeline entries</dt>
          <dd>{state.timeline.length}</dd>
        </dl>
      </section>

      <section>
        <h2>Plugin board</h2>
        <PluginControlBoard
          title="Active plugins"
          plugins={plugins}
          onToggle={(pluginId, enabled) => {
            setPlugins((current) =>
              current.map((entry) => (entry.id === pluginId ? { ...entry, enabled } : entry)),
            );
          }}
        />
      </section>

      <section>
        <h2>Audit view</h2>
        <button type="button" onClick={() => void audit.refresh()} disabled={audit.loading}>
          Refresh audit
        </button>
        <p>Score: {audit.score}</p>
        <ul>
          {audit.tags.map((tag) => (
            <li key={tag}>{tag}</li>
          ))}
        </ul>
      </section>
    </main>
  );
};
