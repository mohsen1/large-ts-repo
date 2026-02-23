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
