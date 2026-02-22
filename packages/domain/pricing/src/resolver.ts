import { PriceRule, QuoteInput, QuoteOutput, PriceTier } from './types';
import { applyRules, defaultPolicy } from './policy';

export const selectTier = (tiers: readonly PriceTier[], quantity: number): PriceTier | undefined =>
  tiers
    .slice()
    .sort((a, b) => b.from - a.from)
    .find((tier) => quantity >= tier.from && (tier.to == null || quantity <= tier.to));

export const applyPricing = (rule: PriceRule, quantity: number): number => {
  const tier = selectTier(rule.tiers, quantity) ?? rule.tiers[0];
  if (!tier) return rule.baseAmount * quantity;
  return rule.baseAmount * quantity * (1 - tier.discountRate);
};

export const quote = (rule: PriceRule, quantity: number, discounts = [] as any): QuoteOutput => {
  const baseAmount = applyPricing(rule, quantity);
  const input: QuoteInput = {
    amount: baseAmount,
    rules: [rule],
    discounts,
  };
  return applyRules(input, defaultPolicy);
};
