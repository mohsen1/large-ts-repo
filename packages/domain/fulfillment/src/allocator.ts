export interface CarrierPlan {
  carrier: string;
  etaMinutes: number;
  surcharge: number;
}

export interface ShippingRateInput {
  destinationZip: string;
  weightKg: number;
  dimensionsCm: [number, number, number];
}

export const carriers: CarrierPlan[] = [
  { carrier: 'UPS', etaMinutes: 300, surcharge: 8 },
  { carrier: 'DHL', etaMinutes: 240, surcharge: 12 },
  { carrier: 'USPS', etaMinutes: 420, surcharge: 4 },
];

export const rate = (input: ShippingRateInput): CarrierPlan => {
  const [x, y, z] = input.dimensionsCm;
  const volume = x * y * z;
  const base = input.weightKg * 0.8 + volume / 1000;
  return carriers
    .map((carrier) => ({
      ...carrier,
      etaMinutes: carrier.etaMinutes + Math.round(base),
      surcharge: carrier.surcharge + base / 10,
    }))
    .reduce((best, candidate) => (candidate.surcharge < best.surcharge ? candidate : best));
};

export const quote = (input: ShippingRateInput): string => {
  const best = rate(input);
  return `Use ${best.carrier} for ${best.etaMinutes}m + $${best.surcharge.toFixed(2)}`;
};
