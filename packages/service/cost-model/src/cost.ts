export interface CostInput {
  cpuMs: number;
  memoryMB: number;
  durationMs: number;
}

export interface CostProfile {
  computeUnits: number;
  dollar: number;
  confidence: number;
}

export function estimate(input: CostInput): CostProfile {
  const computeUnits = input.cpuMs / 10 + input.memoryMB / 4 + input.durationMs / 100;
  return {
    computeUnits,
    dollar: computeUnits * 0.0007,
    confidence: 0.9,
  };
}

export function combine(a: CostProfile, b: CostProfile): CostProfile {
  return {
    computeUnits: a.computeUnits + b.computeUnits,
    dollar: a.dollar + b.dollar,
    confidence: (a.confidence + b.confidence) / 2,
  };
}
