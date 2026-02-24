import { usePolicyStudioOrchestration } from '../hooks/usePolicyStudioOrchestration';
import { PolicyCommandCenter } from '../components/PolicyCommandCenter';

export const PolicyOrchestrationStudioPage = () => {
  const { state, controls } = usePolicyStudioOrchestration();
  return (
    <main>
      <h1>Policy Orchestration Studio</h1>
      <p>
        mode={state.workspace.mode} | artifacts={state.queryResult?.items.length ?? 0} |
        selected={state.workspace.selectedNodeIds.length} | lastRun=
        {state.lastCommand ?? 'none'}
      </p>
      <PolicyCommandCenter state={state} controls={controls} />
      <section>
        <h3>Runtime Trace</h3>
        <ul>
          {state.workspace.traces.map((trace) => (
            <li key={trace.commandId}>
              {trace.severity}: {trace.message}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
};

