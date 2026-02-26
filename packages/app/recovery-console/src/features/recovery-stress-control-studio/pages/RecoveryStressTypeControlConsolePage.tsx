import { useMemo } from 'react';
import { useTypeTemplateSolver } from '../hooks/useTypeTemplateSolver';
import { StressTypeLabBoard } from '../components/StressTypeLabBoard';
import { useStressTypeOrchestrator } from '../hooks/useStressTypeOrchestrator';
import { TypeTemplateConstraintTable } from '../components/TypeTemplateConstraintTable';
import { StressTypeLabInspector } from '../components/StressTypeLabInspector';

const panelModes = ['audit', 'simulate', 'graph', 'validate', 'stress', 'explore'] as const;

export const RecoveryStressTypeControlConsolePage = () => {
  const orchestrator = useStressTypeOrchestrator('console-tenant', 'audit');
  const solver = useTypeTemplateSolver(panelModes);

  const modeMatrix = useMemo(() => {
    const matrix = panelModes.map((mode) => {
      const applied = solver.applyMode(mode);
      return {
        mode,
        rows: applied.catalog.length,
        diagnostics: applied.diagnostics.length,
      };
    });
    return matrix;
  }, [solver]);

  const commandCount = orchestrator.state.snapshot.commands.length;

  return (
    <main>
      <h1>Recovery Stress Type Control Console</h1>
      <section>
        <p>Tenant: {orchestrator.state.snapshot.seed.tenant}</p>
        <p>Command count: {commandCount}</p>
        <p>Mode matrix entries: {modeMatrix.length}</p>
      </section>
      <table>
        <thead>
          <tr>
            <th>Mode</th>
            <th>Rows</th>
            <th>Diagnostics</th>
          </tr>
        </thead>
        <tbody>
          {modeMatrix.map((entry) => (
            <tr key={entry.mode}>
              <td>{entry.mode}</td>
              <td>{entry.rows}</td>
              <td>{entry.diagnostics}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <StressTypeLabBoard
        state={orchestrator.state}
        commandBuckets={orchestrator.commandBuckets}
        branchOutcomes={orchestrator.branchOutcomes}
        metrics={orchestrator.metrics}
        setMode={orchestrator.setMode}
        enqueue={orchestrator.enqueue}
        run={orchestrator.run}
        pause={orchestrator.pause}
        resume={orchestrator.resume}
        clear={orchestrator.clear}
      />
      <StressTypeLabInspector commands={orchestrator.state.snapshot.commands} />
      <TypeTemplateConstraintTable mode={orchestrator.state.mode} />
    </main>
  );
};
