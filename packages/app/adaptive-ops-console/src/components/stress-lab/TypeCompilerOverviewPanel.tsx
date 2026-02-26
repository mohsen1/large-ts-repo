import { memo } from 'react';
import type { TypeCompilerWorkbenchState } from '../../hooks/useTypeCompilerWorkbench';

interface TypeCompilerOverviewPanelProps {
  readonly state: TypeCompilerWorkbenchState;
}

export const TypeCompilerOverviewPanel = memo(({ state }: TypeCompilerOverviewPanelProps) => {
  return (
    <section className="type-compiler-overview">
      <header>
        <h3>Compiler Stress Overview</h3>
        <p>{state.tenant}</p>
      </header>
      <ul>
        <li>Manifest: {state.manifestId}</li>
        <li>Events: {state.eventCount}</li>
        <li>Seed: {state.seed}</li>
        <li>Route key: {state.routeTemplate}</li>
        <li>Loading: {String(state.loading)}</li>
      </ul>
      <div>
        {state.steps.map((step) => (
          <div key={`${step.opcode}-${step.index}`}>
            <strong>{step.opcode}</strong>
            <span>{step.state}</span>
            <span>{step.handled ? ' handled' : ' blocked'}</span>
          </div>
        ))}
      </div>
    </section>
  );
});

TypeCompilerOverviewPanel.displayName = 'TypeCompilerOverviewPanel';
