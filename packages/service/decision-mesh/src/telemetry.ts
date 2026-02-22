import { Tracer, measure, type Span } from '@platform/observability';

export interface MeshEvent {
  requestId: string;
  tenantId: string;
  eventType: 'started' | 'completed' | 'failed';
  status?: string;
}

export interface MeshStats {
  total: number;
  success: number;
  failed: number;
  p95Ms: number;
  meanMs: number;
}

export interface MeshTelemetry {
  observe<T>(name: string, run: () => Promise<T>): Promise<T>;
  markStarted(event: MeshEvent): void;
  markCompleted(event: MeshEvent, runtimeMs: number): void;
  markFailed(event: MeshEvent, error: string): void;
  report(): MeshStats;
  spans(): readonly Span[];
}

export class InMemoryMeshTelemetry implements MeshTelemetry {
  private readonly spansData: Span[] = [];
  private readonly events: Array<{ event: MeshEvent; runtimeMs?: number; error?: string }> = [];
  private readonly tracer = new Tracer();

  observe<T>(name: string, run: () => Promise<T>): Promise<T> {
    return measure(this.tracer, name, run);
  }

  markStarted(event: MeshEvent): void {
    this.events.push({ event });
  }

  markCompleted(event: MeshEvent, runtimeMs: number): void {
    this.events.push({ event, runtimeMs });
  }

  markFailed(event: MeshEvent, error: string): void {
    this.events.push({ event, error });
  }

  report(): MeshStats {
    const completed = this.events.filter((entry) => entry.runtimeMs !== undefined);
    const failed = this.events.filter((entry) => entry.event.eventType === 'failed' || entry.error !== undefined).length;
    const successful = this.events.length - failed;
    const runtimes = completed
      .map((entry) => entry.runtimeMs ?? 0)
      .filter((value) => value > 0)
      .sort((left, right) => left - right);

    const meanMs = runtimes.length > 0 ? runtimes.reduce((acc, value) => acc + value, 0) / runtimes.length : 0;
    const p95Index = runtimes.length > 0 ? Math.max(0, Math.floor(runtimes.length * 0.95) - 1) : 0;

    return {
      total: this.events.length,
      success: successful,
      failed,
      meanMs,
      p95Ms: runtimes[p95Index] ?? 0,
    };
  }

  spans(): readonly Span[] {
    return this.tracer.snapshot();
  }
}
