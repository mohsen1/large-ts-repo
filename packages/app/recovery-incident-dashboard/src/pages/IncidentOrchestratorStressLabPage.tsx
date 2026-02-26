import { IncidentOrchestratorRouteMatrix } from '../components/IncidentOrchestratorRouteMatrix';
import { IncidentOrchestratorStressPanel } from '../components/IncidentOrchestratorStressPanel';
import { resolveRouteCollection } from '@shared/type-level/stress-conditional-constellation';
import { evaluateBooleanChain, evaluateNumericChain } from '@shared/type-level/stress-binary-expression-lattice';
import { evaluateControlGrid } from '@shared/type-level/stress-control-grid';
import { useIncidentOrchestratorStress } from '../hooks/useIncidentOrchestratorStress';

const booleanSamples: [true, false, 1, 0, ''] = [true, false, 1, 0, ''];

const numericSamples = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const IncidentOrchestratorStressLabPage = () => {
  const { state, actions } = useIncidentOrchestratorStress();
  const boolEvaluation = evaluateBooleanChain(booleanSamples);
  const numericProjection = evaluateNumericChain(numericSamples);
  const routes = resolveRouteCollection([
    'incident/triage/critical',
    'continuity/simulate/low',
    'audit/dispatch/notice',
  ]);
  const firstRoute = routes[0];
  const branchTrace = evaluateControlGrid({
    opcode: 'A00',
    value: numericProjection,
    enabled: boolEvaluation,
    label: `${firstRoute.domain}:${firstRoute.action}`,
  });

  return (
    <main className="orchestrator-stress-page">
      <header>
        <h1>Incident Orchestrator Stress Lab</h1>
        <p>
          Boolean path: {String(boolEvaluation)} | Numeric path: {numericProjection}
        </p>
        <p>Route sample: {firstRoute.route}</p>
        <p>
          Branch sample: {branchTrace.status} / {branchTrace.weight}
        </p>
      </header>
      <section>
        <IncidentOrchestratorStressPanel state={state} actions={actions} />
      </section>
      <section>
        <IncidentOrchestratorRouteMatrix seed={state.seed} />
      </section>
    </main>
  );
};
