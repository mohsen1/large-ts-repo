import { useCallback, useState } from 'react';
import { z } from 'zod';
import { useMeshEngineWorkspace } from '../hooks/useMeshWorkspace';
import { MeshCommandDeck, MeshCommandHistory } from '../components/MeshCommandDeck';
import { MeshTopologyGraph, MeshTopologyMiniCard, MeshGraphLegend } from '../components/MeshTopologyGraph';
import { MeshTimeline } from '../components/MeshTimeline';
import { summarizeConsoleConfig } from '../types/meshConsoleTypes';
import { getRuntimeStats } from '../services/meshTopologyService';
import type { EngineEnvelope, MeshSignalKind, MeshPayloadFor } from '@service/recovery-ops-mesh-engine';

const modeSchema = z.enum(['single', 'batch']);

type ViewMode = z.infer<typeof modeSchema>;

export const MeshOrchestratorPage = () => {
  const workspace = useMeshEngineWorkspace({ planId: 'default-mesh', initialKind: 'pulse' });
  const [mode, setMode] = useState<ViewMode>('single');
  const stats = getRuntimeStats();

  const run = useCallback(async () => {
    const nextValue = workspace.lastSignal.kind === 'pulse'
      ? (workspace.lastSignal.payload as { value: number }).value
      : 0;
    const next = {
      planId: workspace.topology.id,
      kind: workspace.selectedKind,
      value: nextValue,
    };
    await workspace.submit(next);
  }, [workspace]);

  const config = summarizeConsoleConfig({
    namespace: 'mesh.page',
    enabled: true,
    maxBatch: stats.maxBatch,
    sampleRate: stats.sampleRate,
  });

  return (
    <main>
      <header>
        <h2>Recovery Mesh Orchestrator</h2>
        <p>Mode: {mode}</p>
        <button
          type="button"
          onClick={() => setMode(mode === 'single' ? 'batch' : 'single')}
        >
          Toggle mode
        </button>
        <p>
          Config {config.namespace}: {config.enabled ? 'enabled' : 'disabled'} max={config.maxBatch} rate={config.sampleRate}
        </p>
      </header>

      <section>
        <MeshTopologyMiniCard topology={workspace.topology} />
        <MeshTopologyGraph
          topology={workspace.topology}
          selectedKind={workspace.selectedKind}
          onNodeSelect={() => {
            return void 0;
          }}
        />
        <MeshGraphLegend topology={workspace.topology} />
      </section>

      <MeshCommandDeck
        signal={workspace.lastSignal}
        artifact={
          workspace.lastResponse
            ? {
                runId: workspace.lastResponse.runId,
                adapter: workspace.lastResponse.source,
                startedAt: workspace.lastResponse.emittedAt,
                state: 'done',
                emitted: 1,
                errors: 0,
              }
            : undefined
        }
        disabled={workspace.running}
        onRun={() => run()}
      />

      <MeshTimeline
        topology={workspace.topology}
        events={
          workspace.lastResponse
            ? [workspace.lastResponse as EngineEnvelope<MeshPayloadFor<MeshSignalKind>>]
            : []
        }
      />

      <MeshCommandHistory
        artifacts={workspace.queue
          .map((command, index) => ({
            id: `${command.id}-${index}`,
            state: 'queued',
            startedAt: Date.now(),
            emitted: index + 1,
          }))}
      />

      <section>
        <label>
          Active nodes: {workspace.nodeCount}
          <br />
          Active kind: {workspace.selectedKind}
        </label>
      </section>
    </main>
  );
};
