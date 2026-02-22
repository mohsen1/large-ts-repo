export interface PolicyRule {
  id: string;
  action: string;
  subject: string[];
  effect: 'allow' | 'deny';
}

export class PolicyStore {
  private rules: PolicyRule[] = [];
  add(rule: PolicyRule): void {
    this.rules.push(rule);
  }

  check(action: string, subject: string): boolean {
    return this.rules.some((rule) => rule.action === action && rule.subject.includes(subject) && rule.effect === 'allow');
  }

  all(): readonly PolicyRule[] {
    return [...this.rules];
  }
}
