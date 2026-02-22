export interface ComplianceMetrics {
  readonly processed: number;
  readonly blocked: number;
  readonly errors: number;
  readonly lastUpdated: string;
}

export class ComplianceTelemetry {
  private processed = 0;
  private blocked = 0;
  private errors = 0;
  private lastUpdated = new Date(0).toISOString();

  markProcessed(blocked: boolean): void {
    this.processed += 1;
    if (blocked) this.blocked += 1;
    this.lastUpdated = new Date().toISOString();
  }

  markError(): void {
    this.errors += 1;
    this.lastUpdated = new Date().toISOString();
  }

  read(): ComplianceMetrics {
    return {
      processed: this.processed,
      blocked: this.blocked,
      errors: this.errors,
      lastUpdated: this.lastUpdated,
    };
  }
}
