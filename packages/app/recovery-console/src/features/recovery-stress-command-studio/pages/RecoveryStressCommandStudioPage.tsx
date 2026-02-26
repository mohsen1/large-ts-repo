import { useState } from 'react';
import {
  useRecoveryStressCommandStudio,
} from '../hooks/useRecoveryStressCommandStudio';
import { StressCommandDashboard } from '../components/StressCommandDashboard';
import { StressRouteCatalogGrid } from '../components/StressRouteCatalogGrid';
import { StressCommandTimeline } from '../components/StressCommandTimeline';
import {
  buildStudioCommands,
  dispatchStudioCommandTrace,
} from '../services/stress-command-studio-engine';
import { defaultProfile, type StressCommandMode, type StressCommandRoute } from '../types';
import { stressRouteCatalog } from '@shared/type-level/stress-orchestrator-mesh';

const modeOptions: readonly StressCommandMode[] = ['configure', 'inspect', 'simulate', 'execute', 'review', 'archive'];

const routeSeed = stressRouteCatalog as readonly StressCommandRoute[];

export const RecoveryStressCommandStudioPage = () => {
  const [tenant] = useState(() => 'tenant-stress-command-studio');
  const [selectedMode, setSelectedMode] = useState<StressCommandMode>('configure');
  const [selectedRoute, setSelectedRoute] = useState<StressCommandRoute | null>(null);
  const [selectedCount, setSelectedCount] = useState(24);

  const { state, setMode, run, refresh, commands, buckets, results, currentMode, status } = useRecoveryStressCommandStudio(
    tenant,
    selectedMode,
  );

  const fallbackCommands = buildStudioCommands(selectedCount);
  const localProfile = defaultProfile(tenant);

  const commandRows =
    selectedMode === 'execute'
      ? results.map((result) => ({
          route: result.route,
          accepted: result.accepted,
          message: result.message,
        }))
      : [];

  const selectedRows = selectedRoute
    ? commands.filter((command) => command.route === selectedRoute)
    : commands.slice(0, 8);

  const applyCount = (value: number) => {
    setSelectedCount(Math.max(1, value));
    refresh();
  };

  const onSelectRoute = (route: StressCommandRoute) => {
    setSelectedRoute(route);
  };

  const modeHandler = (nextMode: StressCommandMode) => {
    setSelectedMode(nextMode);
    setMode(nextMode);
  };

  const runBatch = async () => {
    await run();
  };

  const modeBucketCount = {
    configure: commandRows.length,
    inspect: selectedRows.length,
    simulate: routeSeed.length,
    execute: selectedCount,
    review: localProfile.defaultPriority,
    archive: routeSeed.filter((route) => route.includes('/replay')).length,
  };

  return (
    <main>
      <header>
        <h1>Recovery Stress Command Studio</h1>
        <p>tenant={tenant}</p>
        <p>status={status}</p>
        <p>
          current mode={currentMode} • routes={routeSeed.length} • selected={selectedRows.length} • bucket={modeBucketCount[selectedMode]}
        </p>
      </header>

      <section>
        <h2>Controls</h2>
        <label>
          Mode
          <select value={selectedMode} onChange={(event) => modeHandler(event.target.value as StressCommandMode)}>
            {modeOptions.map((modeOption) => (
              <option key={modeOption} value={modeOption}>
                {modeOption}
              </option>
            ))}
          </select>
        </label>
        <label>
          Command count
          <input
            type="number"
            value={selectedCount}
            min={1}
            max={240}
            onChange={(event) => applyCount(Number(event.target.value))}
          />
        </label>
        <button type="button" onClick={runBatch}>
          Run command batch
        </button>
          <button type="button" onClick={() => {
            void refresh();
          }}>
          Refresh commands
          </button>
      </section>

      <StressCommandDashboard
        state={state}
        commands={commands}
        buckets={buckets}
        results={results}
        mode={selectedMode}
        onRun={runBatch}
        onRefresh={async () => {
          await refresh();
        }}
      />

      <StressRouteCatalogGrid
        routes={routeSeed}
        commands={commands}
        selected={selectedRoute}
        onSelect={onSelectRoute}
      />

      <section>
        <h2>Route summary</h2>
        <p>Fallback commands: {fallbackCommands.length}</p>
        <ul>
          {selectedRows.slice(0, 8).map((command) => (
            <li key={command.id}>
              {command.id} | {command.route} | mode {command.mode} | priority {command.priority}
            </li>
          ))}
        </ul>
        <p>Result count: {commandRows.length}</p>
        <ul>
          {commandRows.slice(0, 8).map((entry) => (
            <li key={entry.route}>
              {entry.route}: {String(entry.accepted)} {entry.message}
            </li>
          ))}
        </ul>
      </section>

      <StressCommandTimeline
        commands={routeSeed}
        results={results}
        mode={currentMode}
      />

      <section>
        <h3>Diagnostics</h3>
        <pre>{JSON.stringify(dispatchStudioCommandTrace, null, 2)}</pre>
      </section>
    </main>
  );
};
