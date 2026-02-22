import { z } from 'zod';
import { Order } from '@domain/orders';
import { Invoice } from '@domain/billing';
import {
  FulfillmentEstimate,
  FulfillmentId,
  FulfillmentPlan,
  FulfillmentStrategy,
  PlanContext,
  PlanCandidate,
} from './types';
import { defaultPolicy, validatePolicy as validateFulfillmentPolicy } from './policies';

const estimateSchema = z.object({
  leadMinutes: z.number().int().positive(),
  laborCost: z.number().nonnegative(),
  transportCost: z.number().nonnegative(),
  riskScore: z.number().min(0).max(1),
});

export interface AllocationInput {
  order: Order;
  invoice: Invoice;
  strategy: FulfillmentStrategy;
}

export interface Allocator {
  chooseCandidate(context: PlanContext): Promise<PlanCandidate[]>;
}

export const createCandidate = (order: Order, invoice: Invoice, strategy: FulfillmentStrategy): PlanCandidate => {
  const risk = Math.min(0.95, Math.max(0, (order.lines.length * 0.12) / Math.max(1, invoice.lines.length)));
  const estimate: FulfillmentEstimate = {
    totalLeadMinutes: strategy === 'express' ? 90 : 180,
    laborCost: { currency: invoice.lines[0]?.unitPrice?.currency ?? 'USD', amount: order.lines.length * 2.5 },
    transportCost: { currency: invoice.lines[0]?.unitPrice?.currency ?? 'USD', amount: 8 + risk * 12 },
    riskScore: risk,
  };

  return {
    id: `candidate-${order.id}` as PlanCandidate['id'],
    orderId: order.id,
    riskLevel: risk,
    estimate,
  };
};

const validateCandidateEstimate = (candidate: PlanCandidate): FulfillmentEstimate => {
  const parsed = estimateSchema.parse({
    leadMinutes: candidate.estimate.totalLeadMinutes,
    laborCost: candidate.estimate.laborCost.amount,
    transportCost: candidate.estimate.transportCost.amount,
    riskScore: candidate.estimate.riskScore,
  });

  return {
    totalLeadMinutes: parsed.leadMinutes,
    laborCost: { currency: candidate.estimate.laborCost.currency, amount: parsed.laborCost },
    transportCost: { currency: candidate.estimate.transportCost.currency, amount: parsed.transportCost },
    riskScore: parsed.riskScore,
  };
};

export interface FulfillmentCandidateSummary {
  candidateId: FulfillmentId;
  tenantId: string;
  orderId: string;
  estimate: FulfillmentEstimate;
  score: number;
}

export const chooseBestCandidate = async (input: AllocationInput): Promise<FulfillmentCandidateSummary[]> => {
  const policyViolations = validateFulfillmentPolicy(defaultPolicy);
  if (policyViolations.length > 0) {
    throw new Error('invalid policy');
  }

  const c = createCandidate(input.order, input.invoice, input.strategy);
  const estimate = validateCandidateEstimate(c);
  const score = estimate.totalLeadMinutes * estimate.riskScore + estimate.transportCost.amount;

  return [
    {
      candidateId: c.id,
      tenantId: input.order.tenantId as unknown as string,
      orderId: input.order.id,
      estimate,
      score,
    },
  ];
};

export interface AllocationContext {
  priority: number;
}

export class SimpleAllocator implements Allocator {
  constructor(private readonly planTemplate: FulfillmentPlan<AllocationContext>) {}

  async chooseCandidate(context: PlanContext): Promise<PlanCandidate[]> {
    const candidates: PlanCandidate[] = [];

    const policyViolations = validateFulfillmentPolicy(defaultPolicy);
    if (policyViolations.length > 0) {
      return candidates;
    }

    for (const step of this.planTemplate.steps) {
      const stepContext = step.context as AllocationContext;
      const estimate: FulfillmentEstimate = {
        totalLeadMinutes: 45 + (stepContext?.priority ?? 0) * 2,
        laborCost: { currency: 'USD', amount: stepContext?.priority ?? 0 },
        transportCost: { currency: 'USD', amount: this.planTemplate.steps.length * 10 },
        riskScore: Math.min(1, 0.2 + (stepContext?.priority ?? 0) / 100),
      };

      candidates.push({
        id: `candidate-${context.order.id}-${step.id}` as PlanCandidate['id'],
        orderId: context.order.id,
        riskLevel: estimate.riskScore,
        estimate,
      });
    }

    return candidates;
  }
}
