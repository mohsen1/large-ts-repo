import { useMemo } from 'react';
import { TypeCompilerOverviewPanel } from '../components/stress-lab/TypeCompilerOverviewPanel';
import { TypeCompilerRouteMap } from '../components/stress-lab/TypeCompilerRouteMap';
import { useTypeCompilerWorkbench } from '../hooks/useTypeCompilerWorkbench';
import type { WorkbenchOpcode } from '@domain/recovery-lab-synthetic-orchestration';
import { stressTsStressHarness } from '@shared/type-level';

const workloadOpcodes = (() => {
  const set = new Set<WorkbenchOpcode>();
  for (const opcodes of Object.values(stressTsStressHarness.routeCatalog)) {
    for (const opcode of opcodes) {
      set.add((opcode as unknown) as WorkbenchOpcode);
    }
  }
  return [...set];
})();

export const TypeCompilerWorkbenchPage = () => {
  const opcode = (workloadOpcodes[0] ?? 'boot') as WorkbenchOpcode;
  const state = useTypeCompilerWorkbench({
    tenant: 'tenant-type-compiler',
    routeCount: 42,
    opcode,
  });

  const mapTitle = useMemo(() => `Type compiler route map • ${state.eventCount}`, [state.eventCount]);

  return (
    <main className="type-compiler-workbench-page">
      <h2>{mapTitle}</h2>
      <TypeCompilerOverviewPanel state={state} />
      <TypeCompilerRouteMap steps={state.steps} tenant={state.tenant} />
    </main>
  );
};
