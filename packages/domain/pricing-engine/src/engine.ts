import { RateCard, PricingInput, PricingOutput } from './types';
import { applyAllDiscounts } from './strategies';

export interface PricingEngine {
  estimate(input: PricingInput): Promise<PricingOutput>;
  applyCard(input: PricingInput, card: RateCard): PricingOutput;
}

export class DynamicPricingEngine implements PricingEngine {
  constructor(private readonly cards: readonly RateCard[]) {}

  async estimate(input: PricingInput): Promise<PricingOutput> {
    const card = this.pickCard(input);
    return this.applyCard(input, card);
  }

  applyCard(input: PricingInput, card: RateCard): PricingOutput {
    const eligible = card.discounts.filter((rule) => rule.conditions.includes(`region:${input.region}`));
    return applyAllDiscounts(input, card, eligible);
  }

  pickCard(input: PricingInput): RateCard {
    const byProduct = this.cards.find((card) => card.productId === input.productId);
    if (byProduct) return byProduct;
    const fallbackCurrency = this.cards.find((card) => card.currency === input.region.startsWith('eu') ? 'EUR' : 'USD');
    return fallbackCurrency ?? this.cards[0]!;
  }
}

export function compose(pricing: PricingEngine): PricingEngine {
  return {
    estimate: pricing.estimate,
    applyCard: pricing.applyCard,
  };
}
