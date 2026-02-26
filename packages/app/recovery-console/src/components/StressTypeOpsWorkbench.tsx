import { type ReactElement, useEffect, useMemo, useState } from 'react';
import { useRecoveryStressWorkbench } from '../hooks/useRecoveryStressWorkbench';
import { StressSolverControlPanel } from './StressSolverControlPanel';
import { resolveSolverDiscriminant } from '@shared/type-level-composition';
import {
  parseRouteLine,
  runStressDiagnostics,
  streamStressNodes,
  type BranchPayload,
  type RouteBlueprint,
  routeTemplates,
} from '../services/recoveryStressAdapter';

interface Props {
  readonly tenant: string;
}

const routeBadge = (template: string): string => {
  const [domain, action] = parseRouteLine(template);
  return `${domain}-${action ?? 'unknown'}`;
};

export const StressTypeOpsWorkbench = ({ tenant }: Props): ReactElement => {
  const [snapshot, setSnapshot] = useState<string>('init');
  const [payloads, setPayloads] = useState<readonly BranchPayload<string>[]>([]);
  const {
    state,
    routeCount,
    activeRoute,
    diagnostics,
    canStep,
    graph,
    step,
    selectTemplate,
    run,
  } = useRecoveryStressWorkbench({ tenant, initialState: 'idle' });

  const dispatch = resolveSolverDiscriminant('solver-validate-draft');
  const routes = useMemo(() => routeTemplates.slice(0, routeCount), [routeCount]);

  useEffect(() => {
    runStressDiagnostics().then((result) => {
      setSnapshot(result.state);
      setPayloads([{
        active: result.state !== 'idle',
        kind: routeTemplates.at(0) ? routeTemplates[0] : 'start',
        raw: 'diagnostic',
        prefix: 'seed',
      } as BranchPayload<string>]);
    });
  }, [run]);

  const applyPatch = () => {
    const blueprint = {
      catalog: {
        example: {
          template: routeTemplates[0],
          payload: { action: 'start', input: 'seed', route: '/recovery/start/session' },
        },
      },
      chains: [] as const,
      tokens: {
        0: 'fleet_start',
      } as const,
      total: routeTemplates.length,
      union: {} as { [K in typeof routeTemplates[number]]: { route: K } },
    } as unknown;
    streamStressNodes(blueprint as unknown as RouteBlueprint<typeof routeTemplates>);
  };

  const graphNode = {
    solver: graph.verbs.at(0) ?? 'validate',
  };

  return (
    <section className="stress-type-ops-workbench">
      <header>
        <h2>Recovery console stress workbench</h2>
        <p>
          Tenant: {tenant} | Snapshot: {snapshot} | State: {state} | Diagnostics: {diagnostics.length}
        </p>
        <button
          type="button"
          disabled={!canStep}
          onClick={() => {
            void run();
          }}
        >
          Run stress harness
        </button>
        <button
          type="button"
          onClick={applyPatch}
        >
          Recompute route map
        </button>
      </header>
      <p>Active route: {activeRoute ?? 'none'}</p>
      <ul>
        {routes.map((route: string, index: number) => {
          const badge = routeBadge(route);
          const payload = diagnostics[index];
          return (
            <li key={route}>
              <button
                type="button"
                onClick={() => {
                  selectTemplate(route);
                  void step(index);
                }}
              >
                {badge}
              </button>
              <span>{payload?.text ?? 'no-payload'}</span>
            </li>
          );
        })}
      </ul>
      <div className="dispatch-meta">
        <small>
          Solver state: {graphNode.solver}-{dispatch.kind}
        </small>
        <small>Discriminator ready: {dispatch.ready ? 'yes' : 'no'}</small>
      </div>
      <StressSolverControlPanel
        tenant={tenant}
        graph={graph}
        payloads={payloads}
      />
    </section>
  );
};
