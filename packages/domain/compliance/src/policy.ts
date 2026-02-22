export interface PolicyRule {
  id: string;
  check: string;
  required: boolean;
}

export interface Policy {
  id: string;
  name: string;
  rules: PolicyRule[];
}

export interface Evaluation {
  policyId: string;
  passed: number;
  failed: number;
}

export const evaluate = (policy: Policy, checks: Record<string, boolean>): Evaluation => {
  let passed = 0;
  let failed = 0;
  for (const rule of policy.rules) {
    const ok = checks[rule.check] === true;
    if (ok) passed += 1;
    else if (rule.required) failed += 1;
  }
  return { policyId: policy.id, passed, failed };
};

export const summarize = (evaluations: Evaluation[]): string => {
  const pass = evaluations.reduce((acc, value) => acc + value.passed, 0);
  const fail = evaluations.reduce((acc, value) => acc + value.failed, 0);
  return `pass=${pass} fail=${fail}`;
};
