import { useMemo } from 'react';
import { TypeCompilerAtlasPanel } from '../components/stress-lab/TypeCompilerAtlasPanel';
import { TypeCompilerOrbitPanel } from '../components/stress-lab/TypeCompilerOrbitPanel';
import {
  catalogBuilderState,
  compileHubConstraints,
  dispatchFacade,
  runFlowDecisionSurface,
  type AtlasBundle,
} from '@domain/recovery-lab-synthetic-orchestration';
import { invokeHubFlow } from '@domain/recovery-lab-synthetic-orchestration';

type BundleSummary = typeof catalogBuilderState;

export const TypeCompilerAtlasWorkbenchPage = () => {
  const harnessSummary = useMemo<BundleSummary>(() => catalogBuilderState, []);
  const constraintCount = useMemo(() => compileHubConstraints().length, []);
  const dispatchFlow = useMemo(() => runFlowDecisionSurface().length, []);
  const dispatchTrace = useMemo(() => invokeHubFlow(dispatchFacade.trace as any), [dispatchFacade.trace]);

  const bundle: AtlasBundle<readonly ['/incident/discover/high/R10']> = {
    routes: ['/incident/discover/high/R10'],
    signatures: [] as unknown as AtlasBundle<readonly ['/incident/discover/high/R10']>['signatures'],
    projection: [] as unknown as AtlasBundle<readonly ['/incident/discover/high/R10']>['projection'],
  };

  return (
    <main className="type-compiler-atlas-workbench">
      <h2>Type Compiler Atlas Workbench</h2>
      <section>
        <h3>Snapshot</h3>
        <p>Rows: {harnessSummary.rows.length}</p>
        <p>Wrapped: {harnessSummary.wrapped.length}</p>
        <p>Nested Levels: {harnessSummary.signature.length}</p>
        <p>Chain Nodes: {harnessSummary.recursive.token ? 1 : 0}</p>
        <p>Constraint Count: {constraintCount}</p>
        <p>Flow Decisions: {dispatchFlow}</p>
      </section>
      <section>
        <h3>Dispatch</h3>
        <p>Trace Count: {dispatchTrace.length}</p>
        <pre>{JSON.stringify(dispatchTrace.slice(0, 4), null, 2)}</pre>
      </section>
      <section>
        <h3>Atlas Bundle</h3>
        <pre>{JSON.stringify(bundle, null, 2)}</pre>
      </section>
      <TypeCompilerAtlasPanel />
      <TypeCompilerOrbitPanel />
    </main>
  );
};
