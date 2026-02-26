import { useMemo } from 'react';
import { useStressTypeOrchestrator } from '../hooks/useStressTypeOrchestrator';
import { defaultModeSequence } from '../types/stressTypeLabSchema';
import { StressTypeLabBoard } from '../components/StressTypeLabBoard';
import { StressTypeLabInspector } from '../components/StressTypeLabInspector';
import { TypeTemplateConstraintTable } from '../components/TypeTemplateConstraintTable';

export const RecoveryStressTypeLabPage = () => {
  const orchestrator = useStressTypeOrchestrator('stress-lab-tenant', defaultModeSequence[0]);
  const sequenceLabel = useMemo(() => defaultModeSequence.join(', '), []);

  return (
    <main>
      <h1>Recovery Stress Type Lab</h1>
      <p>Mode sequence: {sequenceLabel}</p>
      <p>Run token: {orchestrator.state.runToken}</p>
      <p>Tick: {orchestrator.state.tick}</p>
      <section>
        <button type="button" onClick={() => orchestrator.setMode('explore')}>
          Explore
        </button>
        <button type="button" onClick={() => orchestrator.setMode('simulate')}>
          Simulate
        </button>
        <button type="button" onClick={() => orchestrator.setMode('validate')}>
          Validate
        </button>
        <button type="button" onClick={() => orchestrator.setMode('audit')}>
          Audit
        </button>
        <button type="button" onClick={() => orchestrator.setMode('stress')}>
          Stress
        </button>
        <button type="button" onClick={() => orchestrator.setMode('graph')}>
          Graph
        </button>
      </section>
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
