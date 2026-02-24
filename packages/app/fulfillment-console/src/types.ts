export interface FulfillmentEntityRef {
  tenantId: string;
  entityId: string;
}

export interface FulfillmentDashboardFilter {
  tenantId: string;
  productId?: string;
  horizonMinutes: number;
  minConfidence: number;
}

export interface FulfillmentSignalPoint {
  timestamp: string;
  sku: string;
  expected: number;
  observed: number;
  variance: number;
  confidence: number;
}

export interface FulfillmentScenarioCard {
  scenarioId: string;
  title: string;
  score: number;
  riskBand: 'low' | 'medium' | 'high' | 'critical';
  tags: readonly string[];
}
