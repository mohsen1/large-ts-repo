import { useState } from 'react';
import { SurfaceRunCard } from '../components/SurfaceRunCard';
import { SurfaceCommandQueue } from '../components/SurfaceCommandQueue';
import { SurfaceRunTimeline } from '../components/SurfaceRunTimeline';
import { withBrand } from '@shared/core';
import { useDrillSurfaceOrchestrator } from '../hooks/useDrillSurfaceOrchestrator';

export const RecoveryDrillSurfaceOrchestratorPage = () => {
  const {
    analyses,
    command,
    error,
    latestRunId,
    runDry,
    runOne,
    refresh,
    running,
    stats,
    windows,
    workspaceSummary,
  } = useDrillSurfaceOrchestrator('ws-main');
  const [selected, setSelected] = useState<string | undefined>(undefined);

  const queuedCommands = command
    ? [
      {
        commandId: command.commandId,
        type: command.type,
        workspaceId: withBrand('ws-main', 'DrillWorkspaceId'),
        scenarioId: withBrand('scenario-main', 'DrillScenarioId'),
        goal: {
          label: command.goal.label,
          scoreTarget: command.goal.scoreTarget,
          riskTarget: command.goal.riskTarget,
          maxDurationMinutes: command.goal.maxDurationMinutes,
        },
        profile: command.profile,
        requestedBy: command.requestedBy,
        requestedAt: command.requestedAt,
      },
    ]
    : [];

  return (
    <main style={{ padding: 16, display: 'grid', gap: 16 }}>
      <header>
        <h1>Surface Drill Orchestrator</h1>
        <p>
          active={stats.commandQueue.length} completed={stats.completedCount} failed={stats.failedCount} latest={latestRunId ?? 'none'}
        </p>
      </header>

      <section>
        <p>
          queued {workspaceSummary.queued} windows={workspaceSummary.windows} completed={workspaceSummary.completed} failed={workspaceSummary.failed}
        </p>
        <p>
          commands {analyses.length}
        </p>
      </section>

      <section style={{ display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => void runOne()} disabled={running}>
          {running ? 'Running...' : 'Run next surface command'}
        </button>
        <button type="button" onClick={() => void runDry()}>
          Run dry command
        </button>
        <button type="button" onClick={() => refresh()}>
          Refresh
        </button>
      </section>

      {error ? <p style={{ color: 'red' }}>error: {error}</p> : null}

      {command ? (
        <section>
          <h2>Last command</h2>
          <pre>{JSON.stringify(command, null, 2)}</pre>
        </section>
      ) : null}

      <SurfaceCommandQueue
        windows={windows}
        commands={queuedCommands}
      />

      <SurfaceRunTimeline analyses={analyses} onSelect={setSelected} />

      <section>
        {analyses.map((analysis, index) => (
          <SurfaceRunCard
            key={analysis.runId}
            analysis={analysis}
            index={index}
            onSelect={setSelected}
          />
        ))}
      </section>

      {selected ? <p>selected={selected}</p> : null}
    </main>
  );
};
