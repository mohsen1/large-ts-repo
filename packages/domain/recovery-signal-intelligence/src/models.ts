export type HexColor = `#${string}`;

export type SignalDimension =
  | 'capacity'
  | 'latency'
  | 'reachability'
  | 'integrity'
  | 'availability'
  | 'cost'
  | 'compliance';

export type SignalCategory =
  | 'readiness'
  | 'drill'
  | 'incident'
  | 'policy'
  | 'fleet';

export type RiskVector = 'low' | 'medium' | 'high' | 'critical';

export type Seconds = number & { readonly brand: unique symbol };
export type Millis = number & { readonly brand: unique symbol };

export interface SignalCoordinate {
  x: number;
  y: number;
}

export interface SignalPulse {
  id: string;
  category: SignalCategory;
  tenantId: string;
  facilityId: string;
  dimension: SignalDimension;
  value: number;
  baseline: number;
  weight: number;
  timestamp: ISODateString;
  observedAt: ISODateString;
  source: 'agent' | 'telemetry' | 'manual' | 'simulator';
  unit: string;
  tags: string[];
}

export interface SignalTrajectoryPoint {
  time: ISODateString;
  value: number;
  confidence: number;
}

export interface SignalEnvelope {
  id: string;
  pulseId: string;
  samples: SignalTrajectoryPoint[];
  dimension: SignalDimension;
  confidenceFloor: number;
  confidenceCeiling: number;
}

export interface SignalBundle {
  id: string;
  tenantId: string;
  pulses: SignalPulse[];
  envelopes: SignalEnvelope[];
  generatedBy: string;
  generatedAt: ISODateString;
}

export interface SignalWindow {
  start: ISODateString;
  end: ISODateString;
  bucketMinutes: number;
  labels: string[];
}

export interface SignalIntensity {
  dimension: SignalDimension;
  intensity: number;
  drift: number;
  confidence: number;
  baselineDelta: number;
  riskVector: RiskVector;
}

export interface SignalPriority {
  pulseId: string;
  rank: number;
  urgency: RiskVector;
  why: string[];
  projectedRecoveryMinutes: number;
}

export interface SignalFeedSnapshot {
  facilityId: string;
  tenantId: string;
  asOf: ISODateString;
  pulses: SignalPulse[];
  priorities: SignalPriority[];
  intensityByDimension: Record<SignalDimension, SignalIntensity>;
}

export interface SignalPlan {
  id: string;
  tenantId: string;
  signals: SignalPulse[];
  windows: SignalWindow[];
  score: number;
  confidence: number;
  actions: SignalPlanAction[];
}

export interface SignalPlanAction {
  actionId: string;
  pulseId: string;
  dimension: SignalDimension;
  runbook: string;
  command: string;
  expectedSavings: number;
}

export interface SignalCommand {
  id: string;
  tenantId: string;
  createdAt: ISODateString;
  requestedBy: string;
  planId: string;
  state: 'queued' | 'approved' | 'running' | 'completed' | 'failed';
  checkpoints: string[];
  metadata: Record<string, unknown>;
}

export type SignalGraphEdge<T extends { id: string }> = {
  from: T['id'];
  to: T['id'];
  weight: number;
  rationale: string;
};

export interface SignalGraph<T extends { id: string }> {
  nodes: ReadonlyArray<T>;
  edges: ReadonlyArray<SignalGraphEdge<T>>;
}

export interface SignalGraphAudit {
  generatedAt: ISODateString;
  nodeCount: number;
  cycleDetected: boolean;
  topologicalDepth: number;
  disconnectedClusters: number;
}

export type ISODateString = string;
