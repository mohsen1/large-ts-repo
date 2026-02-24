import { useMemo, useState } from 'react';
import type { StageScript, RuntimeDirective } from '@domain/recovery-stress-lab-intelligence/orchestration-dsl';
import { compileWorkflowScript, renderRouteGraph } from '@domain/recovery-stress-lab-intelligence/orchestration-dsl';
import {
  type FleetRunResult,
  executeFleet,
  type FleetRunOptions,
} from '@service/recovery-stress-lab-orchestrator/stress-lab-fleet';
import { type GraphInput } from '@domain/recovery-stress-lab-intelligence/flow-graph';
import {
  createStrategyRoute,
  buildStrategyPlan,
  buildStrategyInput,
} from '@domain/recovery-stress-lab-intelligence/strategy-catalog';

interface StepInput {
  readonly tenantId: string;
  readonly zone: string;
}

interface ScenarioState {
  readonly script: string;
  readonly runAsText: string;
  readonly directive?: RuntimeDirective<StageScript>;
  readonly result?: FleetRunResult;
}

const templateSteps = ['start tenant', 'wait 120', 'notify ops', 'validate', 'stop'];

export function createDefaultScenario(tenantId: string, zone: string): string {
  return [
    `start tenant=${tenantId}`,
    `target zone=${zone}`,
    `notify team=stress-lab` + '\n' + `validate runbook-${tenantId}`,
    `observe lane=${zone}`,
  ].join('\n');
}

const applyTemplate = (source: string): string => {
  return source.replace(/\s+/g, ' ').trim().toLowerCase();
};

export function StressLabScenarioBuilder({ tenantId, zone }: StepInput) {
  const [state, setState] = useState<ScenarioState>(() => ({
    script: createDefaultScenario(tenantId, zone),
    runAsText: templateSteps.join('\n'),
  }));

  const graph = useMemo<GraphInput>(() => ({
    region: zone,
    nodes: [
      { id: 'seed', lane: 'observe', kind: 'seed', outputs: ['simulate'] },
      { id: 'simulate', lane: 'simulate', kind: 'simulate', outputs: ['recommend'] },
      { id: 'recommend', lane: 'recommend', kind: 'recommend', outputs: ['restore'] },
      { id: 'restore', lane: 'restore', kind: 'restore', outputs: [] },
    ],
    edges: [
      { id: 'seed->simulate', from: 'seed', to: ['simulate'], direction: 'northbound', channel: 'seed-to-sim' },
      { id: 'simulate->recommend', from: 'simulate', to: ['recommend'], direction: 'interlane', channel: 'sim-to-rec' },
      { id: 'recommend->restore', from: 'recommend', to: ['restore'], direction: 'southbound', channel: 'rec-to-rest' },
    ],
  }), [zone]);

  const compiled = useMemo(() => compileWorkflowScript(state.script), [state.script]);

  const summary = useMemo(() => {
    const routeGraph = renderRouteGraph(compiled.script);
    const route = createStrategyRoute(tenantId, ['observe', 'simulate', 'recommend']);
    const plan = buildStrategyPlan(
      buildStrategyInput(tenantId, `run-${Date.now()}`, [] as never),
      ['observe', 'simulate', 'recommend'],
    );
    return {
      route,
      routeGraph,
      tags: [...plan.route.tags],
      nodeCount: graph.nodes.length,
    };
  }, [graph.nodes.length, tenantId, compiled.script]);

  const run = async () => {
    const options: FleetRunOptions = {
      tenant: tenantId,
      zone,
      graph,
      scripts: [state.script],
      strategyInput: {
        tenant: tenantId as never,
        runId: state.runAsText,
        signals: [] as never,
        forecastScore: state.script.length / 10,
      },
    };

    const result = await executeFleet(options);
    setState((previous) => ({
      ...previous,
      result,
      directive: buildScenarioDirective(state.script, tenantId),
    }));
  };

  return (
    <section className="stress-lab-scenario-builder">
      <h2>Scenario Builder</h2>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <label>
          Scenario source
          <textarea
            value={state.script}
            onChange={(event) => {
              const next = applyTemplate(event.currentTarget.value);
              setState((previous) => ({ ...previous, script: next }));
            }}
            rows={7}
          />
        </label>
        <label>
          Run label
          <input
            value={state.runAsText}
            onChange={(event) => {
              setState((previous) => ({ ...previous, runAsText: event.currentTarget.value }));
            }}
          />
        </label>
        <button type="submit">Execute scenario</button>
      </form>
      <div>
        <h3>Plan summary</h3>
        <p>Route: {summary.route.key}</p>
        <p>Route graph: {summary.routeGraph}</p>
        <p>Tags: {summary.tags.join(', ')}</p>
      </div>
      <div>
        <h3>Execution</h3>
        <pre>{state.directive ? JSON.stringify(state.directive, null, 2) : 'No directive yet'}</pre>
      </div>
      <div>
        <h3>Compiled steps</h3>
        <ol>
          {compiled.script.map((step) => (
            <li key={step.id}>
              {step.verb}: {step.route}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const buildScenarioDirective = (script: string, tenantId: string): RuntimeDirective<StageScript> => {
  const plan = compileWorkflowScript(script, Math.max(1, script.length));
  return {
    id: `directive:${tenantId}:${Date.now()}` as never,
    steps: plan.script,
    deadlineEpochMs: Date.now() + 30 * 1000,
    labels: {
      tenantId,
      source: 'builder',
    },
  };
};
