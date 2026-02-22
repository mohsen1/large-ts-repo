import { Rule, RuleInput, RuleId } from './rules';
import { RiskProfile, updateScore } from './scores';

export interface Evaluation {
  profile: RiskProfile;
  blocked: boolean;
  decisions: Array<{ ruleId: RuleId; value: number }>;
}

export class RiskEngine {
  private readonly rules: Rule[];

  constructor(rules: Rule[]) {
    this.rules = rules;
  }

  evaluate(profile: RiskProfile, input: RuleInput): Evaluation {
    let current = profile;
    const decisions: Array<{ ruleId: RuleId; value: number }> = [];
    for (const rule of this.rules) {
      const value = rule.check(input);
      decisions.push({ ruleId: rule.id, value });
      current = updateScore(current, Math.min(current.score, value), rule.id);
      if (value < rule.scoreThreshold) {
        return { profile: current, blocked: true, decisions };
      }
    }

    return { profile: current, blocked: false, decisions };
  }
}
