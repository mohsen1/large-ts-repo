import { ok, fail, type Result } from '@shared/result';
import { defaultWindowPolicy, type ObserverNamespace, type MetricRecord, type WindowPolicy } from '@domain/recovery-lens-observability-models';
import { InMemoryLensStore } from '@data/recovery-lens-observability-store';
import { runPipeline } from './pipeline';
import { buildSampleTopology } from '@domain/recovery-lens-observability-models';

export interface OrchestratorRun {
  readonly namespace: ObserverNamespace;
  readonly summary: string;
  readonly points: number;
  readonly mode: WindowPolicy['mode'];
}

export class LensOrchestrator {
  readonly #namespace: ObserverNamespace;
  readonly #store: InMemoryLensStore;

  public constructor(namespace: ObserverNamespace) {
    this.#namespace = namespace;
    this.#store = new InMemoryLensStore(namespace);
  }

  public async run<TPayload extends Record<string, unknown>>(
    payloads: readonly TPayload[],
    policy: WindowPolicy = defaultWindowPolicy,
  ): Promise<Result<OrchestratorRun, Error>> {
    const points: MetricRecord<TPayload>[] = payloads.map((payload, index) => ({
      timestamp: new Date().toISOString(),
      namespace: this.#namespace,
      metric: `metric:${index}` as const,
      payload,
      severity: 'info',
    }));

    const insertion = await this.#store.ingest(this.#namespace, points);
    if (!insertion.ok) {
      return fail(insertion.error);
    }

    const summary = await runPipeline(
      this.#namespace,
      buildSampleTopology(this.#namespace),
      points,
    );

    return ok({
      namespace: this.#namespace,
      summary: `topology:${summary.topologyNodes}:${summary.topologyEdges}`,
      points: summary.count,
      mode: policy.mode,
    });
  }

  public async close(): Promise<Result<number, Error>> {
    const snapshot = await this.#store.writeSnapshot(this.#namespace);
    if (!snapshot.ok) {
      return fail(snapshot.error);
    }
    return ok(snapshot.value.length);
  }
}

export const runOrchestrator = async <TPayload extends Record<string, unknown>>(
  namespace: ObserverNamespace,
  payloads: readonly TPayload[],
  _topology?: object,
): Promise<Result<{ namespace: ObserverNamespace; blueprint: string }, Error>> => {
  const orchestrator = new LensOrchestrator(namespace);
  const result = await orchestrator.run(payloads);
  if (!result.ok) {
    return fail(result.error);
  }
  return ok({
    namespace,
    blueprint: `${result.value.summary}:${result.value.points}`,
  });
};
