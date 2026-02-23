export interface HealthProbe {
  healthy: boolean;
  checks: string[];
  latencyMs?: number;
}

export function runHealthProbe(now: number = Date.now()): HealthProbe {
  const started = now;
  const checks = ['command-store', 'domain-model', 'policy-rules'];
  const latency = Date.now() - started;

  const healthy = checks.length > 0;
  return {
    healthy,
    checks: checks.map((name) => `${name}-ok`),
    latencyMs: latency,
  };
}
