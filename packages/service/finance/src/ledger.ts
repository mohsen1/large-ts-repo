import { Invoice, InvoiceLine, createMoney } from '@domain/billing';

export interface Entry {
  id: string;
  debit: number;
  credit: number;
  ref: string;
}

export interface Ledger {
  id: string;
  entries: Entry[];
}

export const debit = (ledger: Ledger, id: string, amount: number, ref: string): Ledger => ({
  ...ledger,
  entries: [...ledger.entries, { id, debit: Math.max(0, amount), credit: 0, ref }],
});

export const credit = (ledger: Ledger, id: string, amount: number, ref: string): Ledger => ({
  ...ledger,
  entries: [...ledger.entries, { id, debit: 0, credit: Math.max(0, amount), ref }],
});

export const balance = (ledger: Ledger): number => {
  return ledger.entries.reduce((acc, entry) => acc + entry.debit - entry.credit, 0);
};

export const fromInvoice = (invoice: Invoice): Ledger => ({
  id: invoice.id,
  entries: [
    { id: 'sales', debit: 0, credit: invoice.total.amount, ref: 'revenue' },
    { id: 'receivable', debit: invoice.total.amount, credit: 0, ref: 'accounts-receivable' },
  ],
});
