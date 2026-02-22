import { RiskEngine } from '@domain/risk';
import { Rule, defaultRule, highValueRule, ipBlacklistRule, RuleInput } from '@domain/risk/rules';
import { createProfile, RiskProfile, aggregate } from '@domain/risk/scores';

export interface ReputationServiceConfig {
  blacklist: string[];
}

export class ReputationService {
  private readonly engine: RiskEngine;

  constructor(config: ReputationServiceConfig) {
    const rules: Rule[] = [ipBlacklistRule(config.blacklist), highValueRule, defaultRule];
    this.engine = new RiskEngine(rules);
  }

  inspect(input: RuleInput): { profile: RiskProfile; blocked: boolean } {
    const current = createProfile(input);
    const result = this.engine.evaluate(current, input);
    return { profile: result.profile, blocked: result.blocked };
  }

  static average(profiles: readonly RiskProfile[]): number {
    return aggregate(profiles);
  }
}
