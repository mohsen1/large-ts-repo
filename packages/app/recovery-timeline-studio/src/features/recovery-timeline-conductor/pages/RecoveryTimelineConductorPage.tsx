import { Fragment, useMemo, useState } from 'react';
import { useTimelineConductorWorkspace } from '../hooks/useTimelineConductorWorkspace';
import {
  type ConductorInput,
  type ConductorMode,
} from '@domain/recovery-timeline-orchestration';
import { getTimeline, listTimelines } from '../../../services/recoveryTimelineAdapter';
import { TimelineConductorCanvas } from '../components/TimelineConductorCanvas';
import { TimelineConductorPluginGrid } from '../components/TimelineConductorPluginGrid';
import { TimelineConductorPolicyPanel } from '../components/TimelineConductorPolicyPanel';
import { createConductorId } from '@domain/recovery-timeline-orchestration';

export function RecoveryTimelineConductorPage() {
  const [mode, setMode] = useState<ConductorMode>('observe');
  const [plugin, setPlugin] = useState<string | null>(null);

  const timelineSeeds = useMemo(() => listTimelines({ ownerTeam: 'Ops Team', includeSegments: true }), []);
  const seed = useMemo<ConductorInput>(
    () => ({
      seedTimeline: timelineSeeds[0] ?? getTimeline('seed::default')!,
      mode,
      plugins: plugin === null ? ['timeline-plugin/plan-a'] : [plugin],
      windowMinutes: 20,
      pluginNames: plugin === null ? ['timeline-plugin/plan-a'] : [plugin],
      profile: 'adaptive',
    }),
    [mode, plugin, timelineSeeds],
  );

  const {
    state,
    metrics,
    catalog,
    output,
    loading,
    preview,
    runConductor,
    setFilterMode,
    setMinRisk,
    setOwnerTeam,
    setPlugin: setWorkspacePlugin,
  } = useTimelineConductorWorkspace(seed);

  return (
    <main>
      <header>
        <h1>Recovery Timeline Conductor</h1>
        <p>
          Interactive orchestration and policy planning for timelines with reusable plugin chains.
        </p>
      </header>

      <section>
        <label>
          Team
          <input
            type="text"
            defaultValue="Ops Team"
            onBlur={(event) => setOwnerTeam(event.currentTarget.value)}
          />
        </label>
        <label>
          Minimum risk
          <input
            type="range"
            min={0}
            max={100}
            value={state.filter.minRisk}
            onChange={(event) => setMinRisk(Number(event.currentTarget.value))}
          />
        </label>
        <label>
          Mode
          <select value={mode} onChange={(event) => {
            const selected = event.currentTarget.value as ConductorMode;
            setMode(selected);
            setFilterMode(selected);
          }}>
            <option value="observe">observe</option>
            <option value="simulate">simulate</option>
            <option value="stabilize">stabilize</option>
          </select>
        </label>
      </section>

      <section>
        <TimelineConductorPluginGrid
          mode={mode}
          selectedPlugin={plugin}
          onSelectPlugin={(next) => {
            setPlugin(next);
            setWorkspacePlugin(next);
          }}
        />
      <TimelineConductorPolicyPanel
          output={output ?? {
            id: createConductorId(mode),
            timelineId: timelineSeeds[0]?.id ?? 'timeline-preview',
            mode,
            riskProfile: { low: 0, medium: 0, high: 0, critical: 0 },
            timelineWindow: [],
            nextSteps: ['observe'],
            snapshot: {
              timelineId: timelineSeeds[0]?.id ?? 'timeline-preview',
              source: 'studio',
              measuredAt: new Date(),
              confidence: 0.65,
              expectedReadyAt: new Date(),
              actualReadyAt: undefined,
              note: 'studio-preview',
            },
          }}
          pending={state.timelines.length}
        />
      </section>

      <section>
        <h3>Catalog ({catalog.length})</h3>
        <ul>
          {catalog.map((item) => <li key={item}>{item}</li>)}
        </ul>
      </section>

      <section>
        <button type="button" disabled={loading} onClick={() => void preview()}>
          Preview Orchestra
        </button>
        <button type="button" disabled={loading} onClick={() => void runConductor()}>
          Execute Conductor
        </button>
      </section>

      <section>
        <h3>Timelines</h3>
        {state.timelines.map((timeline) => (
          <Fragment key={timeline.id}>
            <article>
              <h4>{timeline.name}</h4>
              <p>{timeline.ownerTeam} / {timeline.id}</p>
              <TimelineConductorCanvas events={timeline.events} metric={metrics} />
            </article>
          </Fragment>
        ))}
      </section>
    </main>
  );
}
