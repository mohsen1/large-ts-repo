export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface AlertRule {
  id: string;
  expression: string;
  severity: Severity;
  windowMs: number;
  threshold: number;
}

export interface Alert {
  id: string;
  rule: string;
  severity: Severity;
  message: string;
  createdAt: number;
  resolved: boolean;
}

export class RuleEngine {
  private rules: AlertRule[] = [];
  private alerts: Alert[] = [];

  addRule(rule: AlertRule): void {
    this.rules.push(rule);
  }

  evaluate(samples: Record<string, number>): Alert[] {
    const now = Date.now();
    for (const rule of this.rules) {
      const value = samples[rule.expression] ?? 0;
      if (value > rule.threshold) {
        this.alerts.push({
          id: `${rule.id}-${now}`,
          rule: rule.id,
          severity: rule.severity,
          message: `expression ${rule.expression} exceeded threshold ${rule.threshold}`,
          createdAt: now,
          resolved: false,
        });
      }
    }
    return [...this.alerts];
  }

  resolve(id: string): void {
    const item = this.alerts.find((alert) => alert.id === id);
    if (item) item.resolved = true;
  }

  active(): readonly Alert[] {
    return this.alerts.filter((alert) => !alert.resolved);
  }
}
