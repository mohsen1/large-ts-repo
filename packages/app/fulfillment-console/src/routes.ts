import { bootstrapFulfillmentRun } from './bootstrap';

export interface RouteRequest {
  tenantId: string;
  orderId: string;
  strategy: 'standard' | 'express' | 'cold-chain' | 'international';
}

export const runFulfillmentRoute = async (request: RouteRequest): Promise<string> => {
  const result = await bootstrapFulfillmentRun(request);
  return result.planId ?? 'unknown-plan';
};

export interface IntellisenseRoute {
  tenantId: string;
  productId: string;
  minimumSla: number;
}

export interface FulfillmentForecastRouteResponse {
  runId: string;
  status: string;
  strategy: 'baseline' | 'burst' | 'throttle' | 'preposition';
  score: number;
}
