import { createOrchestrator, SubmitFulfillmentCommand } from '@service/fulfillment-planner';

export interface ConsoleInput {
  tenantId: string;
  orderId: string;
  strategy: SubmitFulfillmentCommand['strategy'];
}

interface FulfillmentSummary {
  candidateId: string;
  tenantId: string;
  orderId: string;
  estimate: { totalLeadMinutes: number; laborCost: { currency: string; amount: number }; transportCost: { currency: string; amount: number }; riskScore: number };
  score: number;
}

export const bootstrapFulfillmentRun = async (input: ConsoleInput): Promise<{
  planId?: string;
  summary: readonly FulfillmentSummary[];
}> => {
  const service = createOrchestrator();
  const command: SubmitFulfillmentCommand = {
    orderId: input.orderId as any,
    tenantId: input.tenantId,
    strategy: input.strategy,
    forceRun: false,
  };

  const result = await service.submit({
    command,
    invoice: {
      id: `preview-${input.orderId}` as any,
      accountId: input.tenantId as any,
      lines: [],
      subtotal: { currency: 'USD', amount: 42 },
      total: { currency: 'USD', amount: 42 },
      settled: false,
    },
  });

  if (!result.ok) {
    throw result.error;
  }

  return { planId: result.value.planId, summary: [] };
};
