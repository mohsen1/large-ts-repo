import { Brand } from '@shared/type-level';

export type Currency = 'USD' | 'EUR' | 'JPY' | 'GBP' | 'AUD';

export interface Money {
  amount: number;
  currency: Currency;
}

export interface Tier<C extends Currency = Currency> {
  maxQuantity: number;
  unitPrice: Money & { currency: C };
  activeFrom: Date;
  activeTo?: Date;
}

export interface DiscountRule {
  kind: 'percentage' | 'fixed';
  amount: number;
  reason: string;
  conditions: readonly string[];
}

export interface RateCard {
  productId: Brand<string, 'product-id'>;
  currency: Currency;
  tiers: readonly Tier<Currency>[];
  discounts: readonly DiscountRule[];
  fixedFee?: Money;
}

export interface PricingInput {
  productId: Brand<string, 'product-id'>;
  quantity: number;
  userTier: 'free' | 'silver' | 'gold' | 'enterprise';
  region: string;
  now: Date;
}

export interface PricingOutput {
  total: Money;
  subtotal: Money;
  discount: Money;
  taxes: readonly { label: string; amount: Money }[];
  lineItems: readonly { name: string; amount: Money; quantity: number }[];
}
