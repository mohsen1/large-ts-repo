import { Brand } from '@shared/core';

export type ProductId = Brand<string, 'ProductId'>;
export type Sku = Brand<string, 'Sku'>;

export interface PriceTier {
  minQty: number;
  maxQty?: number;
  discount: number;
}

export interface Product {
  id: ProductId;
  sku: Sku;
  name: string;
  description?: string;
  attributes: Record<string, string | number | boolean>;
  tags: string[];
  basePrice: number;
  tiers: PriceTier[];
}

export interface Catalog {
  tenantId: Brand<string, 'TenantId'>;
  products: Product[];
  published: boolean;
}

export const priceFor = (product: Product, quantity: number): number => {
  const applicable = [...product.tiers]
    .sort((a, b) => b.minQty - a.minQty)
    .find((tier) => quantity >= tier.minQty && (tier.maxQty == null || quantity <= tier.maxQty));
  const discount = applicable?.discount ?? 0;
  return product.basePrice * quantity * (1 - Math.max(0, Math.min(1, discount)));
};

export const normalizeSku = (raw: string): Sku => {
  return raw.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '') as Sku;
};
