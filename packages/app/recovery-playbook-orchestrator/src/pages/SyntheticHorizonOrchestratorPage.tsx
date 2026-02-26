import { useMemo, useState } from 'react';
import { ScenarioControlPanel } from '../components/synthetic/ScenarioControlPanel';
import { SyntheticTimeline } from '../components/synthetic/SyntheticTimeline';
import { PluginStatusCard } from '../components/synthetic/PluginStatusCard';
import { useSyntheticHorizon } from '../hooks/useSyntheticHorizon';

export interface SyntheticHorizonOrchestratorPageProps {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly artifactId: string;
}

export const SyntheticHorizonOrchestratorPage = ({
  tenantId,
  workspaceId,
  artifactId,
}: SyntheticHorizonOrchestratorPageProps) => {
  const { state, plans, isRunning, profile, stages, lastPlan, lastError, run, reset, setProfile, toggleStage, selectedStages } =
    useSyntheticHorizon({
      tenantId,
      owner: workspaceId,
    }, {
      stages: ['ingest', 'analyze', 'resolve', 'optimize', 'execute'],
      initialProfile: 'default',
    });

  const timeline = useMemo(() => {
    return selectedStages.map((stage, index) => `${index + 1}:${stage}`);
  }, [selectedStages]);

  const [autoMode, setAutoMode] = useState(false);

  const controls = {
    title: `Synthetic Horizon Orchestrator: ${tenantId}`,
    disabled: isRunning,
    onRun: () => {
      void run();
    },
    onReset: reset,
    onToggleProfile: setProfile,
    onToggleStage: toggleStage as (stage: string) => void,
    activeProfile: profile,
    stages: plans.map((plan) => ({
      stage: plan.stage,
      selected: plan.active,
      required: plan.required,
      index: plan.index,
    })),
  };

  const banner = useMemo(() => {
    if (state.state === 'error') {
      return {
        tone: 'danger',
        text: lastError ?? 'Unknown error',
      };
    }
    if (state.state === 'success') {
      return {
        tone: 'success',
        text: `Completed in ${state.elapsedMs}ms with ${state.okCount}OK / ${state.failCount}fail`,
      };
    }
    if (isRunning) {
      return {
        tone: 'running',
        text: 'Synthetic run in progress...',
      };
    }
    return {
      tone: 'idle',
      text: 'Ready to run synthetic horizon orchestration',
    };
  }, [state, isRunning, lastError]);

  return (
    <main className="synthetic-horizon-page">
      <header>
        <h1>Recovery Horizon Lab</h1>
        <p>
          Tenant <strong>{tenantId}</strong> · Workspace <strong>{workspaceId}</strong> · Artifact <strong>{artifactId}</strong>
        </p>
        <div className={`banner banner--${banner.tone}`}>
          {banner.text}
        </div>
      </header>

      <section className="synthetic-horizon-page__header">
        <label>
          <input
            type="checkbox"
            checked={autoMode}
            onChange={(event) => {
              setAutoMode(event.target.checked);
            }}
          />
          Auto mode
        </label>
        <p>{lastPlan}</p>
      </section>

      <ScenarioControlPanel
        {...controls}
      />

      <section className="synthetic-horizon-page__grid">
        <PluginStatusCard
          tenantId={tenantId}
          owner={workspaceId}
          profile={profile}
          stageCount={stages.length}
          events={state.events}
          runId={state.runId}
        />
        <SyntheticTimeline
          timeline={timeline}
          state={state}
          summary={{
            elapsedMs: state.elapsedMs,
            stageCount: stageCount(selectedStages.length),
            okCount: state.okCount,
            failCount: state.failCount,
          }}
        />
      </section>

      <section>
        <h3>Active stages</h3>
        <ul>
          {plans.map((plan, index) => (
            <li key={plan.stage}>
              <span>{index + 1}</span>
              {' '}
              <strong>{plan.stage}</strong>
              {' '}
              <em>{plan.required ? 'required' : 'optional'}</em>
              {' '}
              <code>{selectedStages.includes(plan.stage) ? 'selected' : 'unselected'}</code>
            </li>
          ))}
        </ul>
      </section>

      {autoMode && (
        <section>
          <h3>Auto mode event stream</h3>
          <button
            type="button"
            onClick={async () => {
              for (let index = 0; index < 3; index++) {
                await run();
                if (index < 2) {
                  reset();
                }
              }
            }}
          >
            Run thrice
          </button>
        </section>
      )}
    </main>
  );
};

function stageCount(value: number): number {
  return value;
}
