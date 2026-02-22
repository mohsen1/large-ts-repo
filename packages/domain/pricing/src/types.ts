import { Brand } from '@shared/core';

export type PriceRuleId = Brand<string, 'PriceRuleId'>;
export type TierId = Brand<string, 'TierId'>;

export interface PriceTier {
  id: TierId;
  from: number;
  to?: number;
  discountRate: number;
}

export interface PriceRule {
  id: PriceRuleId;
  name: string;
  currency: string;
  baseAmount: number;
  tiers: readonly PriceTier[];
}

export type DiscountMode = 'percent' | 'fixed' | 'free-shipping';

export interface DiscountRule {
  id: Brand<string, 'DiscountRule'>;
  mode: DiscountMode;
  value: number;
  enabled: boolean;
}

export interface QuoteInput {
  amount: number;
  rules: readonly PriceRule[];
  discounts: readonly DiscountRule[];
}

export interface QuoteOutput {
  gross: number;
  net: number;
  currency: string;
  applied: string[];
}

export const moneyToMinor = (amount: number): number => Math.round(amount * 100);

export const moneyFromMinor = (amount: number): number => amount / 100;
