import { type ChangeEvent, useMemo, type MouseEvent } from 'react';
import { useRecoveryLabTypeStressNavigator } from '../hooks/useRecoveryLabTypeStressNavigator';
import { type StagePayload, stageCatalog, runStageChain, stageSignature } from '@shared/type-level/stress-overload-generic-factory';
import { runBranchFlow, type BranchSeed, branchStates } from '@shared/type-level-hub';
import { createPluginRegistry, makePluginRecord, pluginCatalog } from '@shared/type-level/stress-hydra-plugin-orchestrator';

type TemplateBundleState = {
  readonly traces: readonly string[];
  readonly stages: ReturnType<typeof runStageChain>;
  readonly pluginCount: number;
};

const summarize = (entries: readonly string[]): string =>
  entries
    .map((entry, index) => `${index + 1}. ${entry}`)
    .slice(0, 10)
    .join(' | ');

const classifySeverity = (route: string): 'critical' | 'high' | 'medium' | 'low' => {
  const parts = route.split('/');
  const severity = parts[3] as 'critical' | 'high' | 'medium' | 'low';
  return severity;
};

type ControlPoint = {
  readonly route: string;
  readonly severity: string;
  readonly phase: string;
  readonly state: string;
};

export const RecoveryLabTemplateControlPlane = () => {
  const {
    state,
    routeEnvelopes,
    timeline,
    diagnostics,
    next,
    previous,
    reset,
    rotate,
    branchState,
  } = useRecoveryLabTypeStressNavigator();

  const pluginBundle = useMemo<TemplateBundleState>(() => {
    const stageFlow = runStageChain(stageCatalog);
    const branchFlow = runBranchFlow(
      {
        id: 'branch-template',
        tenant: 'tenant-nav',
        state: 'init',
        severity: 'high',
      } as BranchSeed,
      branchStates,
    );

    const basePluginSeed = makePluginRecord(
      'plugin-template',
      {
        input: {
          route: '/incident/discover/critical/tenant-alpha',
          seed: 'seed',
        },
        output: {
          route: '/incident/discover/critical/tenant-alpha',
          token: 'plugin-template',
          state: 'ready',
          weight: 1,
        },
        version: '1.0.0',
      },
      {
        kind: 'resolve',
        constraints: {},
        direction: 'center',
        timeoutMs: 200,
      },
    );
    const registry = createPluginRegistry(
      basePluginSeed,
      makePluginRecord(
        'plugin-template-2',
        {
          input: basePluginSeed.contract.input,
          output: basePluginSeed.contract.output,
          version: basePluginSeed.contract.version,
        },
        {
          kind: 'inspect',
          constraints: {},
          direction: 'center',
          timeoutMs: 180,
        },
      ),
    );

    for (const key of ['a', 'b', 'c', 'd', 'e']) {
      const mapKey = `plugin-${key}` as const;
      pluginCatalog.set(
        mapKey,
        makePluginRecord(
          mapKey,
          {
            input: {
              route: state.route,
            },
            output: {
              route: state.route,
              token: mapKey,
              state: 'ready',
              weight: 1,
            },
            version: '1.0.0',
          },
          {
            kind: 'inspect',
            constraints: {},
            direction: 'center',
            timeoutMs: 100,
          },
        ),
      );
    }

    return {
      traces: branchFlow.traces,
      stages: stageFlow,
      pluginCount: registry.size + pluginCatalog.size,
    };
  }, [state.route]);

  const staged = useMemo(() => {
    return [
      ...pluginBundle.stages.map.map((entry) => stageSignature(entry.input)),
      ...pluginBundle.traces.slice(0, 5),
    ];
  }, [pluginBundle]);

  const catalogLines = state.routeLog
    .slice(0, 12)
    .map((entry, index) => `${index}:${entry}`)
    .join('\n');

  const controlPoints = routeEnvelopes.map((entry): ControlPoint => {
    const normalized = `${entry.parts.domain}:${entry.parts.verb}`;
    return {
      route: entry.route,
      severity: entry.parts.severity,
      phase: entry.phase ?? 'generic',
      state: normalized,
    };
  });

  const onModeToggle = (event: ChangeEvent<HTMLInputElement>) => {
    if (event.currentTarget.checked) {
      rotate();
    } else {
      rotate();
    }
  };

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>) => {
    const target = event.currentTarget;
    target.classList.toggle('row-active');
  };

  return (
    <section className="recovery-lab-template-control-plane">
      <h2>Template Control Plane</h2>

      <div className="template-control-toolbar">
        <button type="button" onClick={previous}>
          Previous
        </button>
        <button type="button" onClick={next}>
          Next
        </button>
        <button type="button" onClick={reset}>
          Reset
        </button>
        <label>
          <input type="checkbox" onChange={onModeToggle} />
          Rotate diagnostics
        </label>
      </div>

      <p>
        Route {state.selected + 1}/{state.routeCount} · Branch state {branchState} · Mode class {diagnostics.modeClass}
      </p>
      <p>Current: {state.route}</p>
      <p>Catalog matrix steps {diagnostics.matrixStepCount}</p>
      <p>Solver traces</p>
      <ul>
        {pluginBundle.traces
          .map((entry, index) => `${index}:${entry}`)
          .slice(0, 12)
          .map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
      </ul>

      <h3>Control points</h3>
      <table>
        <thead>
          <tr>
            <th>Route</th>
            <th>Severity</th>
            <th>Phase</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {controlPoints.slice(0, 12).map((point) => (
            <tr key={point.route} onClick={onRowClick}>
              <td>{point.route}</td>
              <td>{classifySeverity(point.route)}</td>
              <td>{point.phase}</td>
              <td>{point.state}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>Timeline</h3>
      <ol>
        {timeline
          .slice(-8)
          .map((entry) => `${new Date(entry.at).toISOString()} · ${entry.mode} · ${entry.route}`)
          .map((entry) => (
            <li key={entry}>{entry}</li>
          ))}
      </ol>

      <h3>Runtime signature</h3>
      <pre>{catalogLines}</pre>
      <pre>{summarize(pluginBundle.traces)}</pre>
      <pre>{staged.join(' / ')}</pre>
      <pre>{pluginBundle.stages.map.map((entry) => stageSignature(entry.input)).join('|')}</pre>
    </section>
  );
};
