import { Fact, FactPredicate, FactSet } from './schema';

export interface Violation {
  id: string;
  reason: string;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
}

export class FactValidator {
  private readonly rules: Array<{ name: string; check: FactPredicate }> = [];

  register(name: string, check: FactPredicate): void {
    this.rules.push({ name, check });
  }

  validate(fact: Fact): ValidationResult {
    const violations: Violation[] = [];
    for (const rule of this.rules) {
      if (!rule.check(fact)) {
        violations.push({ id: rule.name, reason: `failed ${rule.name}` });
      }
    }
    return { ok: violations.length === 0, violations };
  }

  validateSet(facts: readonly Fact[]): ValidationResult {
    const issues: Violation[] = [];
    for (const fact of facts) {
      const result = this.validate(fact);
      if (!result.ok) {
        issues.push(...result.violations);
      }
    }
    return { ok: issues.length === 0, violations: issues };
  }
}

export function validateSet(set: FactSet): ValidationResult {
  const validator = new FactValidator();
  validator.register('has-key', (fact) => fact.key.length > 0);
  validator.register('has-value', (fact) => fact.value !== undefined && fact.value !== null);
  return validator.validateSet(set.facts);
}
