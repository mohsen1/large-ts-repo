import { DiscountRule, Money, PricingInput, PricingOutput, RateCard, Currency, Tier } from './types';

export interface StrategyContext {
  region: string;
  now: Date;
}

export interface DiscountEngine {
  canApply(input: PricingInput, card: RateCard, rule: DiscountRule): boolean;
  apply(input: PricingInput, card: RateCard, rule: DiscountRule): Money;
}

export class RegionDiscount implements DiscountEngine {
  canApply(input: PricingInput, card: RateCard, rule: DiscountRule): boolean {
    const regionRule = rule.conditions.includes(`region:${input.region}`);
    const currencyRule = rule.conditions.includes(`currency:${card.currency}`);
    return regionRule || currencyRule;
  }

  apply(input: PricingInput, card: RateCard, rule: DiscountRule): Money {
    const base = priceForQuantity(card, input.quantity);
    if (rule.kind === 'percentage') {
      const pct = Math.min(rule.amount, 90);
      return { amount: round(base.amount * (pct / 100), 2), currency: card.currency };
    }
    return { amount: Math.min(rule.amount, base.amount), currency: card.currency };
  }
}

export class LoyaltyDiscount implements DiscountEngine {
  canApply(input: PricingInput): boolean {
    return input.userTier === 'gold' || input.userTier === 'enterprise';
  }

  apply(_input: PricingInput, card: RateCard, rule: DiscountRule): Money {
    if (rule.kind === 'fixed') {
      return { amount: Math.min(rule.amount, 250), currency: card.currency };
    }
    return { amount: rule.amount, currency: card.currency };
  }
}

function priceForQuantity(card: RateCard, qty: number): Money {
  const [best] = [...card.tiers].sort((a, b) => b.maxQuantity - a.maxQuantity);
  if (!best) {
    return { amount: 0, currency: card.currency };
  }
  return { amount: best.unitPrice.amount * qty + (card.fixedFee?.amount ?? 0), currency: card.currency };
}

function round(value: number, digits: number): number {
  const pow = 10 ** digits;
  return Math.round(value * pow) / pow;
}

export const defaultEngines: readonly DiscountEngine[] = [
  new RegionDiscount(),
  new LoyaltyDiscount(),
] as const;

export function applyAllDiscounts(input: PricingInput, card: RateCard, rules: readonly DiscountRule[]): PricingOutput {
  const subtotal = priceForQuantity(card, input.quantity);
  const discountSum = rules.reduce((acc, rule) => {
    const applicable = defaultEngines.some((engine) => engine.canApply(input, card, rule));
    if (!applicable) return acc;
    const d = defaultEngines.find((engine) => engine.canApply(input, card, rule))?.apply(input, card, rule) ?? { amount: 0, currency: card.currency };
    return { amount: acc.amount + d.amount, currency: card.currency };
  }, { amount: 0, currency: card.currency });

  const discounted = clampMoney({
    amount: Math.max(subtotal.amount - discountSum.amount, 0),
    currency: card.currency,
  });

  const taxes = computeTaxes(discounted, card.currency);
  return {
    subtotal,
    discount: discountSum,
    total: {
      amount: taxes.reduce((acc, t) => acc + t.amount, discounted.amount),
      currency: card.currency,
    },
    taxes,
    lineItems: [
      { name: `product:${card.productId}`, amount: subtotal, quantity: input.quantity },
      { name: 'discount', amount: { amount: -discountSum.amount, currency: card.currency }, quantity: 1 },
      ...taxes.map((tax) => ({ name: tax.label, amount: tax.amount, quantity: 1 })),
    ],
  };
}

function clampMoney(m: Money): Money {
  return { ...m, amount: Math.max(m.amount, 0) };
}

function computeTaxes(total: Money, currency: Currency): readonly { label: string; amount: Money }[] {
  const vat = round(total.amount * 0.07, 2);
  const local = total.currency === 'USD' ? 0 : round(total.amount * 0.03, 2);
  return [
    { label: 'vat', amount: { amount: vat, currency } },
    { label: 'local', amount: { amount: local, currency } },
  ];
}
