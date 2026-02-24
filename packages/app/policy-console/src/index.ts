import { parsePolicy, applyRules, PolicyExpr, PolicyEvaluationContext } from '@domain/policy-engine';
import { InMemoryAudit, guard } from '@platform/security';

export interface ConsoleInput {
  policy: string;
  principal: string;
  resource: string;
  action: string;
  attributes: Record<string, unknown>;
}

export async function simulate(input: ConsoleInput): Promise<string> {
  const expression: PolicyExpr = parsePolicy(input.policy);
  const context: PolicyEvaluationContext = {
    principal: input.principal,
    resource: input.resource,
    action: input.action,
    attributes: input.attributes,
    now: new Date(),
  };
  const report = applyRules([expression], context);
  const audit = new InMemoryAudit();
  await guard(audit, input.principal, input.action, input.resource);
  return JSON.stringify(report, null, 2);
}

export { usePolicyConsoleWorkspace } from './hooks/usePolicyConsoleWorkspace';
export { PolicyOrchestrationWorkspace } from './components/PolicyOrchestrationWorkspace';
export { PolicyExecutionTimeline } from './components/PolicyExecutionTimeline';
export { PolicyMetricCards } from './components/PolicyMetricCards';
export { PolicyOrchestrationWorkbenchPage } from './pages/PolicyOrchestrationWorkbenchPage';
export { PolicyConsoleOpsPage } from './pages/PolicyConsoleOpsPage';
export { PolicyPluginRegistryPanel } from './components/PolicyPluginRegistryPanel';
export { PolicyRunCards } from './components/PolicyRunCards';
export { PolicyPluginLogTimeline } from './components/PolicyPluginLogTimeline';
export { usePolicyLabWorkspace } from './hooks/usePolicyLabWorkspace';
export { PolicyLabWorkspace } from './components/PolicyLabWorkspace';
export { PolicyLabCommandPanel } from './components/PolicyLabCommandPanel';
export { PolicyLabTimeline } from './components/PolicyLabTimeline';
export { PolicyLabRunDeck } from './components/PolicyLabRunDeck';
export { PolicyLabWorkbenchPage } from './pages/PolicyLabWorkbenchPage';
export { PolicyLabRunInspectorPage } from './pages/PolicyLabRunInspectorPage';
export { usePolicyStudioOrchestration } from './hooks/usePolicyStudioOrchestration';
export { usePolicyTopology } from './hooks/usePolicyTopology';
export { PolicyTopologyBoard } from './components/PolicyTopologyBoard';
export { PolicyScenarioComposer } from './components/PolicyScenarioComposer';
export { PolicyCommandCenter } from './components/PolicyCommandCenter';
export { PolicyOrchestrationStudioPage } from './pages/PolicyOrchestrationStudioPage';
export * from './models/policy-studio-types';
