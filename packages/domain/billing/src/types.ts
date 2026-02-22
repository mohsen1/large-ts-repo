import { Brand } from '@shared/core';

export type InvoiceId = Brand<string, 'InvoiceId'>;
export type LineItemId = Brand<string, 'LineItemId'>;

export interface Money {
  currency: 'USD' | 'EUR' | 'GBP';
  amount: number;
}

export interface PriceList {
  defaultCurrency: Money['currency'];
  conversion: Record<Money['currency'], number>;
}

export interface InvoiceLine {
  id: LineItemId;
  name: string;
  unitPrice: Money;
  quantity: number;
  taxes: number;
}

export interface Invoice {
  id: InvoiceId;
  accountId: Brand<string, 'AccountId'>;
  lines: InvoiceLine[];
  subtotal: Money;
  total: Money;
  settled: boolean;
}

export interface LedgerEntry {
  id: Brand<string, 'LedgerId'>;
  invoiceId: InvoiceId;
  value: Money;
  reason: string;
  postedAt: string;
}

export interface BillingContext {
  currency: Money['currency'];
  rounding: 'ceil' | 'floor' | 'round';
  vatRate: number;
}

export const createMoney = (amount: number, currency: Money['currency']): Money => ({ amount, currency });

export const asLineItem = (line: InvoiceLine): InvoiceLine => ({
  id: line.id,
  name: line.name,
  unitPrice: line.unitPrice,
  quantity: Math.max(1, Math.floor(line.quantity)),
  taxes: line.taxes,
});

export const sumMoney = (left: Money, right: Money): Money => {
  if (left.currency !== right.currency) {
    throw new Error('Currency mismatch');
  }
  return { ...left, amount: left.amount + right.amount };
};
