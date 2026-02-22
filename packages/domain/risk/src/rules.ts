export type RuleId = string;

export interface RuleInput {
  eventType: string;
  amount: number;
  tenantId: string;
  userId: string;
  ip?: string;
}

export interface Rule {
  id: RuleId;
  label: string;
  scoreThreshold: number;
  check: (input: RuleInput) => number;
}

export const defaultRule: Rule = {
  id: 'default-speed',
  label: 'default speed',
  scoreThreshold: 50,
  check: (input) => Math.min(100, Math.max(0, 100 - input.amount)),
};

export const isHighValue = (input: RuleInput): boolean => input.amount > 10_000;

export const highValueRule: Rule = {
  id: 'high-value',
  label: 'high value rule',
  scoreThreshold: 80,
  check: (input) => (isHighValue(input) ? 10 : 95),
};

export const ipBlacklistRule = (blacklist: readonly string[]): Rule => ({
  id: 'ip-blacklist',
  label: 'ip block',
  scoreThreshold: 95,
  check: (input) => {
    return input.ip && blacklist.includes(input.ip) ? 1 : 99;
  },
});
