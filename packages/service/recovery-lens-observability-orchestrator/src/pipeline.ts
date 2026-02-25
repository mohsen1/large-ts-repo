import type { MetricRecord, ObserverNamespace } from '@domain/recovery-lens-observability-models';
import { summarizeTopology, buildSampleTopology, type LensTopology } from '@domain/recovery-lens-observability-models';
import { makeSchedule, runSchedule } from './scheduler';

export type PipelineStepName = `stage:${string}`;

export interface PipelineSummary {
  readonly namespace: ObserverNamespace;
  readonly count: number;
  readonly stages: PipelineStepName[];
  readonly topologyNodes: number;
  readonly topologyEdges: number;
}

export class LensPipeline<TPayload extends Record<string, unknown>> {
  readonly #namespace: ObserverNamespace;
  readonly #topology: LensTopology;

  public constructor(namespace: ObserverNamespace, topology: LensTopology) {
    this.#namespace = namespace;
    this.#topology = topology;
  }

  public async execute(points: readonly MetricRecord<TPayload>[]): Promise<PipelineSummary> {
    const scheduled = runSchedule(points);
    const withSchedule = makeSchedule(scheduled).length;
    const normalized = scheduled.map((point) => ({
      ...point,
      payload: { ...point.payload, normalized: true } as TPayload,
    }));

    const summaries = normalizePayloads(normalized);
    const nodeCount = this.#topology.nodes.length;
    const edgeCount = this.#topology.edges.length;

    return {
      namespace: this.#namespace,
      count: summaries,
      stages: ['stage:normalize', 'stage:schedule', 'stage:emit'],
      topologyNodes: nodeCount,
      topologyEdges: edgeCount,
    };
  }
}

const normalizePayloads = <TPayload extends Record<string, unknown>>(
  points: readonly MetricRecord<TPayload>[],
): number => points.map((point) => ({ ...point, severity: point.severity })).length;

export const runPipeline = async <TPayload extends Record<string, unknown>>(
  namespace: ObserverNamespace,
  topology: LensTopology,
  points: readonly MetricRecord<TPayload>[],
) => {
  const pipeline = new LensPipeline(namespace, topology);
  return pipeline.execute(points);
};

export const pipelineSummary = (namespace: ObserverNamespace): PipelineSummary => {
  const topology = buildSampleTopology(namespace);
  const summary = summarizeTopology(topology);
  return {
    namespace,
    count: 0,
    stages: ['stage:empty'],
    topologyNodes: summary.nodeCount,
    topologyEdges: summary.edgeCount,
  };
};
