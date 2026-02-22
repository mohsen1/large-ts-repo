import { PolicyExpr, PolicyEvaluationContext, PolicyDecision, PolicyReport } from './ast';

export function evaluate(expr: PolicyExpr, context: PolicyEvaluationContext): boolean {
  switch (expr.kind) {
    case 'const':
      if (typeof expr.value === 'boolean') return expr.value;
      if (typeof expr.value === 'number') return expr.value !== 0;
      return expr.value.length > 0;
    case 'var':
      return Boolean(context.attributes[expr.name]);
    case 'not':
      return !evaluate(expr.expr, context);
    case 'and':
      return evaluate(expr.lhs, context) && evaluate(expr.rhs, context);
    case 'or':
      return evaluate(expr.lhs, context) || evaluate(expr.rhs, context);
    case 'cmp': {
      const a = evaluate(expr.left, context);
      const b = evaluate(expr.right, context);
      switch (expr.op) {
        case 'eq':
          return a === b;
        case 'neq':
          return a !== b;
        case 'gt':
          return Number(a) > Number(b);
        case 'lt':
          return Number(a) < Number(b);
        case 'in':
          return String(a).includes(String(b));
        default:
          return false;
      }
    }
    default:
      return false;
  }
}

export function explain(expr: PolicyExpr, context: PolicyEvaluationContext): PolicyDecision {
  const decision = evaluate(expr, context) ? 'allow' : 'deny';
  return {
    ruleId: `${expr.kind}-${context.action}-${context.resource}`,
    decision,
    reasons: [
      `evaluated=${decision}`,
      `action=${context.action}`,
      `resource=${context.resource}`,
      `principal=${context.principal}`,
    ],
    trace: [
      {
        rule: expr.kind,
        matched: decision === 'allow',
        detail: JSON.stringify(context.attributes),
      },
    ],
  };
}

export function applyRules(rules: PolicyExpr[], context: PolicyEvaluationContext): PolicyReport {
  const decisions = rules.map((rule) => explain(rule, context));
  const final = decisions.every((entry) => entry.decision === 'allow') ? 'allow' : 'deny';
  return { context, decisions, final };
}
