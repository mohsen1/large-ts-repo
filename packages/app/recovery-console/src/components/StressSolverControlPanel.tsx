import { type ReactElement, useMemo } from 'react';
import type { ConstraintGraph, SolverRouteState } from '@shared/type-level-composition';
import type { BranchPayload } from '../services/recoveryStressAdapter';

interface Props {
  readonly tenant: string;
  readonly graph: ConstraintGraph<readonly [
    'validate',
    'infer',
    'resolve',
    'merge',
    'accumulate',
    'dispatch',
    'throttle',
    'enforce',
    'report',
    'replay',
  ]>;
  readonly payloads: readonly BranchPayload<string>[];
}

const stateClass = {
  idle: 'state-idle',
  active: 'state-collecting',
  finished: 'state-resolving',
} as const;

export const StressSolverControlPanel = ({ tenant, graph, payloads }: Props): ReactElement => {
  const routeCount = graph.verbs.length;
  const routeLabels = useMemo(() => graph.verbs.map((verb) => `${tenant}-${verb}`), [tenant, graph.verbs]);

  const routeState = (index: number): SolverRouteState => {
    if (index % 4 === 0) {
      return { kind: 'active', phase: 'commit', pending: ['validate', 'resolve'] };
    }
    if (index % 5 === 0) {
      return { kind: 'finished', phase: 'apply', pending: ['report', 'replay'] };
    }
    return { kind: 'idle', phase: 'draft', pending: [] };
  };

  return (
    <section className="stress-solver-control-panel">
      <h3>Solver control panel</h3>
      <p>Tenant: {tenant}</p>
      <p>Routes in graph: {routeCount}</p>
      <p>Diagnostics payload count: {payloads.length}</p>
      <ul>
        {routeLabels.map((label, index) => {
          const state = routeState(index);
          return (
            <li className={stateClass[state.kind]} key={label}>
              <span>{label}</span>
              <code>{state.phase}</code>
              {state.pending.length === 0 ? <em>pending none</em> : <strong>{state.pending.join('+')}</strong>}
            </li>
          );
        })}
      </ul>
      <div>
        <h4>Payload digest</h4>
        <div>
          {payloads.map((item, index) => {
            const token = `${item.kind ?? 'payload'}`;
            return (
              <p key={`${token}-${index}`}>
                {token}::{(item as { readonly raw?: string; readonly prefix?: string }).raw ?? (item as { readonly raw?: string; readonly prefix?: string }).prefix}
              </p>
            );
          })}
        </div>
      </div>
    </section>
  );
};
