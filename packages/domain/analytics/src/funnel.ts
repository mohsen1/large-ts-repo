export interface FunnelStep {
  name: string;
  value: number;
}

export interface FunnelConfig {
  steps: readonly string[];
  minimum?: number;
}

export interface FunnelReport {
  funnel: string;
  hitRate: number;
  dropoffs: readonly { from: string; to: string; loss: number }[];
}

export const buildFunnel = (steps: readonly FunnelStep[]): FunnelReport => {
  if (steps.length < 2) return { funnel: 'short', hitRate: 0, dropoffs: [] };
  const normalized = [...steps].sort((a, b) => a.value - b.value);
  const total = Math.max(1, normalized[0]?.value ?? 1);
  const dropoffs = normalized.slice(1).map((step, idx) => ({
    from: normalized[idx]?.name ?? 'x',
    to: step.name,
    loss: 1 - step.value / total,
  }));
  const hitRate = normalized.at(-1)!.value / total;
  return { funnel: 'generic', hitRate, dropoffs };
};

export const normalize = (value: number): number => (Number.isFinite(value) ? Math.max(0, value) : 0);
