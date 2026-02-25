import { RuntimeTopology, asNodeId } from './topology.js';
import { mapIterator, zipIterator, collect } from './iterators.js';
import { withAsyncScope, AsyncScopedMetric } from './disposables.js';
import {
  MeshDispatchInput,
  MeshDispatchOutput,
  MeshEnvelope,
  MeshPayloadShape,
  MeshRunId,
  MeshRoute,
  MeshStepId,
  MeshZone,
  createTraceId,
  createRunId,
  createStepId,
} from './types.js';
import { ok, fail } from '@shared/result';
import { type Result } from '@shared/type-level';
import type { MeshNode, MeshEdge } from './topology.js';

export interface OrchestratorInput<TPayload extends MeshPayloadShape> {
  readonly runId: MeshRunId;
  readonly envelopes: readonly MeshEnvelope<TPayload>[];
  readonly route: MeshRoute;
  readonly dispatchInput: Omit<MeshDispatchInput, 'route' | 'payloadCount' | 'steps'>;
}

export interface OrchestratedOutput<TPayload, TOutput = never> {
  readonly runId: MeshRunId;
  readonly route: MeshRoute;
  readonly count: number;
  readonly nodes: readonly string[];
  readonly edges: readonly string[];
  readonly output: TOutput;
  readonly payloads: readonly TPayload[];
}

export type OrchestratorResult<TPayload, TOutput> = Result<OrchestratedOutput<TPayload, TOutput>, Error>;

const mapStepIds = <TPayload extends MeshPayloadShape>(
  records: readonly MeshEnvelope<TPayload>[],
): readonly MeshStepId[] => records.map((_: MeshEnvelope<TPayload>, index: number) => createStepId(`step-${index}`, index));

const readRouteZone = (route: MeshRoute): MeshZone => {
  const [, zone] = route.split('.') as [string, string];
  return (zone ?? 'core') as MeshZone;
};

export class MeshOrchestrator<TPayload extends MeshPayloadShape, TOutput> {
  #topology = new RuntimeTopology();

  constructor(private readonly dispatch: (input: MeshDispatchInput) => Promise<MeshDispatchOutput<TOutput>>) {}

  async execute(input: OrchestratorInput<TPayload>): Promise<OrchestratorResult<TPayload, TOutput>> {
    const metric = new AsyncScopedMetric(`mesh:${input.runId}`);
    await using _ = metric;

    for (const [index, envelope] of input.envelopes.entries()) {
      this.#topology.addNode({
        id: asNodeId(`${input.runId}:${index}`),
        label: envelope.route,
        zone: envelope.trace.zone,
        channels: ['analysis'],
        input: envelope.payload,
        output: envelope.payload,
      });
    }

    const envelopeIndexes = collect(
      mapIterator(input.envelopes, (_: MeshEnvelope<TPayload>, index: number) => `${index}`),
    );

    await withAsyncScope('wiring', async () => {
      for (const [_pluginName, envelopeIndex] of zipIterator({
        left: input.envelopes.map((_: MeshEnvelope<TPayload>, index: number) => `plugin-${index % 5}`),
        right: envelopeIndexes,
      })) {
        const from = asNodeId(`${input.runId}:${envelopeIndex}`);
        const to = asNodeId(`${input.runId}:${(Number(envelopeIndex) + 1) % Math.max(1, input.envelopes.length)}`);
        this.#topology.addEdge({
          from,
          to,
          latencyMs: envelopeIndex.length * 3 + 11,
        });
      }
    });

    const dispatchPayload: MeshDispatchInput = {
      ...input.dispatchInput,
      route: input.route,
      payloadCount: input.envelopes.length,
      steps: mapStepIds(input.envelopes),
    };

    const dispatched = await this.dispatch(dispatchPayload);
    if (!dispatched.ok) {
      return fail(new Error('dispatch failed'));
    }

    return ok({
      runId: input.runId,
      route: input.route,
      count: input.envelopes.length,
      nodes: this.#topology.nodes().map((node: MeshNode<unknown, unknown>) => node.id),
      edges: this.#topology.edges().map((edge: MeshEdge) => edge.id),
      output: dispatched.output,
      payloads: collect(mapIterator(input.envelopes, (envelope: MeshEnvelope<TPayload>) => envelope.payload)),
    });
  }

  snapshot(): string {
    return JSON.stringify(this.#topology.snapshot());
  }
}

export const createOrchestrator = <TPayload extends MeshPayloadShape, TOutput>(
  dispatch: (input: MeshDispatchInput) => Promise<MeshDispatchOutput<TOutput>>,
): MeshOrchestrator<TPayload, TOutput> => new MeshOrchestrator(dispatch);

export const runOrchestrator = async <TPayload extends MeshPayloadShape, TOutput>(
  payloads: readonly MeshEnvelope<TPayload & MeshPayloadShape>[],
  dispatch: (input: MeshDispatchInput) => Promise<MeshDispatchOutput<TOutput>>,
  route: MeshRoute = 'analysis.core',
): Promise<OrchestratorResult<TPayload & MeshPayloadShape, TOutput>> => {
  const routeZone = readRouteZone(route);
  const orchestrator = createOrchestrator<TPayload, TOutput>(dispatch);
  const executeInput: OrchestratorInput<TPayload & MeshPayloadShape> = {
    runId: createRunId('run', routeZone),
    route,
    envelopes: payloads,
    dispatchInput: {
      traceId: createTraceId('trace'),
      createdAt: Date.now(),
      runId: createRunId('dispatch', routeZone),
      zone: routeZone,
    },
  };
  return orchestrator.execute(executeInput);
};

export { collect };
