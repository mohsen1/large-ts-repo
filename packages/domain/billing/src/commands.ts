import { InvoiceId, Invoice } from './types';

export interface BillCustomerCommand {
  tenantId: string;
  invoiceId: InvoiceId;
  lines: number;
}

export interface InvoiceCommand {
  command: 'issue' | 'adjust' | 'pay' | 'void';
  invoiceId?: InvoiceId;
  amount?: number;
}

export interface EmitInvoiceEvent {
  eventType: 'billing.invoice_issued' | 'billing.invoice_paid' | 'billing.invoice_voided';
  invoice: Invoice;
}

export type BillingCommand =
  | { type: 'billing.bill-customer'; payload: BillCustomerCommand }
  | { type: 'billing.issue'; payload: InvoiceCommand }
  | { type: 'billing.adjust'; payload: InvoiceCommand }
  | { type: 'billing.pay'; payload: InvoiceCommand }
  | { type: 'billing.void'; payload: InvoiceCommand };

export const isBillingCommand = (value: unknown): value is BillingCommand =>
  typeof value === 'object' && value !== null && 'type' in (value as BillingCommand);
