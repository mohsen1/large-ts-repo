export type PolicyExpr =
  | {
      kind: 'const';
      value: boolean | number | string;
    }
  | {
      kind: 'var';
      name: string;
    }
  | {
      kind: 'not';
      expr: PolicyExpr;
    }
  | {
      kind: 'and';
      lhs: PolicyExpr;
      rhs: PolicyExpr;
    }
  | {
      kind: 'or';
      lhs: PolicyExpr;
      rhs: PolicyExpr;
    }
  | {
      kind: 'cmp';
      op: 'eq' | 'neq' | 'gt' | 'lt' | 'in';
      left: PolicyExpr;
      right: PolicyExpr;
    };

export interface Policy {
  id: string;
  name: string;
  description: string;
  expression: PolicyExpr;
  tags: readonly string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface PolicyRule {
  principal: string;
  resources: readonly string[];
  actions: readonly string[];
  condition: PolicyExpr;
}

export interface PolicySet {
  id: string;
  source: string;
  rules: readonly PolicyRule[];
  disabled: boolean;
}

export interface PolicyEvaluationContext {
  principal: string;
  resource: string;
  action: string;
  attributes: Record<string, unknown>;
  now: Date;
}

export interface PolicyDecision {
  ruleId: string;
  decision: 'allow' | 'deny' | 'neutral';
  reasons: string[];
  trace: Array<{ rule: string; matched: boolean; detail: string }>;
}

export interface PolicyReport {
  context: PolicyEvaluationContext;
  decisions: readonly PolicyDecision[];
  final: 'allow' | 'deny';
}
