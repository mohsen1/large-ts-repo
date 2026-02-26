import { useMemo } from 'react';
import { useRecoveryLabTypeStressNavigator } from '../hooks/useRecoveryLabTypeStressNavigator';
import { stageCatalog, stageMatrix, stageSignature } from '@shared/type-level/stress-overload-generic-factory';
import { createDomainRegistry } from '@shared/type-level/stress-hydra-plugin-orchestrator';
import { branchTimeline, branchEvents } from '@shared/type-level/stress-large-controlflow-branches';

type NavigatorReport = {
  readonly pluginCount: number;
  readonly stageCount: number;
  readonly controlCount: number;
  readonly branchDensity: number;
  readonly catalogKeys: readonly string[];
  readonly stageSignatures: readonly string[];
  readonly routeKeys: readonly string[];
};

type Stat = {
  readonly label: string;
  readonly value: string | number;
};

const asNumber = (value: number): string => value.toLocaleString();
const asPercent = (value: number): string => `${Math.round(value * 10000) / 100}%`;

export const RecoveryLabTypeStressNavigatorPanel = () => {
  const { state, routeEnvelopes, diagnostics, currentRouteIndex, next, previous, rotate, reset } =
    useRecoveryLabTypeStressNavigator();

  const report = useMemo<NavigatorReport>(() => {
    const stageMap = stageMatrix([...stageCatalog], stageSignature);
    const registry = createDomainRegistry('incident');
    const sampleRoute = routeEnvelopes[0]?.route ?? '/incident/discover/critical/tenant-alpha';
    const fakePlugins = [
      {
        route: sampleRoute,
        token: 'plugin-stage',
        state: 'ready',
        weight: 10,
      },
    ];

    return {
      pluginCount: registry.length + fakePlugins.length + stageCatalog.length,
      stageCount: stageCatalog.length,
      controlCount: routeEnvelopes.length,
      branchDensity: state.matrix.steps.length / Math.max(1, branchTimeline(8, 'init').size),
      catalogKeys: [...stageMap.keys()],
      stageSignatures: stageCatalog.map(stageSignature),
      routeKeys: [...branchEvents],
    };
  }, [routeEnvelopes, state.matrix.steps.length]);

  const stats: readonly Stat[] = [
    { label: 'Current route', value: currentRouteIndex + 1 },
    { label: 'Route total', value: state.routeCount },
    { label: 'Plugin count', value: report.pluginCount },
    { label: 'Stage count', value: report.stageCount },
    { label: 'Control count', value: report.controlCount },
    { label: 'Branch density', value: asPercent(report.branchDensity) },
    { label: 'Envelope route count', value: routeEnvelopes.length },
  ];

  const signatures = report.stageSignatures.slice(0, 10);
  const routeKeys = report.routeKeys.slice(0, 14);
  const branches = diagnostics.matrixStepCount;
  const phaseMap = new Map<string, number>();
  for (const route of routeEnvelopes) {
    const phase = String(route.phase);
    phaseMap.set(phase, (phaseMap.get(phase) ?? 0) + 1);
  }

  const phaseRows = [...phaseMap.entries()].map(([phase, count]) => `${phase}:${count}`);

  return (
    <section className="recovery-lab-type-stress-navigator">
      <h2>Stress Navigator</h2>
      <p>Active route: {state.route}</p>
      <p>Log entries: {state.routeLog.length}</p>

      <div className="control-grid">
        {stats.map((stat) => (
          <article key={stat.label}>
            <h3>{stat.label}</h3>
            <p>{typeof stat.value === 'number' ? asNumber(stat.value) : stat.value}</p>
          </article>
        ))}
      </div>

      <h3>Stage signatures</h3>
      <ul>
        {signatures.map((signature) => (
          <li key={signature}>{signature}</li>
        ))}
      </ul>

      <h3>Route keys</h3>
      <ol>
        {routeKeys.map((key) => (
          <li key={key}>{key}</li>
        ))}
      </ol>

      <h3>Phases</h3>
      <ul>
        {phaseRows.map((entry) => (
          <li key={entry}>{entry}</li>
        ))}
      </ul>

      <p>Branch decision count {branches}</p>

      <div className="toolbar">
        <button type="button" onClick={previous}>
          Previous
        </button>
        <button type="button" onClick={next}>
          Next
        </button>
        <button type="button" onClick={rotate}>
          Rotate
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
      </div>
    </section>
  );
};
