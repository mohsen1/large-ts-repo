import { DiscountRule, DiscountMode, QuoteInput, QuoteOutput, PriceRule } from './types';

export interface PricingPolicy {
  allowZeroPrice: boolean;
  maxDiscountPercent: number;
  applyFreeShippingThreshold?: number;
}

export const defaultPolicy: PricingPolicy = {
  allowZeroPrice: false,
  maxDiscountPercent: 0.75,
  applyFreeShippingThreshold: 150,
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const applyDiscount = (amount: number, rule: DiscountRule, policy: PricingPolicy): { amount: number; label: string } => {
  if (!rule.enabled) return { amount, label: 'disabled' };
  if (rule.mode === 'percent') {
    const bounded = clamp(rule.value, 0, policy.maxDiscountPercent * 100);
    return { amount: amount * (1 - bounded / 100), label: `${bounded}%` };
  }
  if (rule.mode === 'fixed') {
    return { amount: Math.max(0, amount - rule.value), label: `${rule.value}` };
  }
  return { amount, label: 'shipping' };
};

export const applyRules = (input: QuoteInput, policy: PricingPolicy): QuoteOutput => {
  const sorted = [...input.rules].sort((a, b) => a.baseAmount - b.baseAmount);
  let current = sorted.length ? sorted[0].baseAmount : input.amount;
  const applied: string[] = [];
  for (const discount of input.discounts) {
    const output = applyDiscount(current, discount, policy);
    if (output.amount !== current) applied.push(discount.id);
    current = output.amount;
  }
  const finalAmount = Math.max(policy.allowZeroPrice ? 0 : 1, current);
  return {
    gross: input.amount,
    net: finalAmount,
    currency: input.rules[0]?.currency ?? 'USD',
    applied,
  };
};
