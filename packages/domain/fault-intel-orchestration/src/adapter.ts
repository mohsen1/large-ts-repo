import type { CampaignId, IncidentSignal, Transport, WorkspaceId } from './models';

export interface SignalEnvelope<TPayload = unknown> {
  readonly transport: Transport;
  readonly campaignId: CampaignId;
  readonly workspaceId: WorkspaceId;
  readonly payload: TPayload;
  readonly seenAt: string;
}

export interface SignalAdapter<TInput, TOutput> {
  readonly id: string;
  readonly transport: Transport;
  readonly supports: readonly Transport[];
  adapt<TSignal extends SignalEnvelope<TInput>>(signal: TSignal): readonly IncidentSignal[];
}

export interface AdapterRecord<TInput, TOutput> {
  readonly adapter: SignalAdapter<TInput, TOutput>;
  readonly namespace: string;
  readonly enabled: boolean;
}

export type AdapterResult<TAdapter extends SignalAdapter<any, any>> = TAdapter extends
  SignalAdapter<any, infer Output> ? Output : never;

export type AdapterByTransport<TAdapters extends readonly SignalAdapter<unknown, unknown>[]> = {
  [A in TAdapters[number] as A['transport']]: A;
};

export type ExtractAdapterOutput<TAdapters extends readonly SignalAdapter<unknown, unknown>[]> = {
  [K in keyof TAdapters]:
    TAdapters[K] extends SignalAdapter<unknown, infer Output> ? Output : never;
};

export interface AdapterCatalog {
  readonly getByTransport: (transport: Transport) => readonly SignalAdapter<unknown, unknown>[];
  readonly getAll: () => readonly SignalAdapter<unknown, unknown>[];
}

export const createNoopAdapter = <TPayload>(transport: Transport): SignalAdapter<SignalEnvelope<TPayload>, IncidentSignal> => ({
  id: `noop:${transport}`,
  transport,
  supports: [transport],
  adapt: ({ payload, campaignId, workspaceId, transport: envelopeTransport, seenAt }) => [
    {
      signalId: `noop-${envelopeTransport}-${seenAt}` as never,
      tenantId: `${payload && (payload as { tenantId?: string }).tenantId}` as never,
      campaignId,
      workspaceId,
      transport: envelopeTransport,
      observedAt: seenAt,
      detector: `adapter:${transport}`,
      severity: 'notice',
      title: `Noop adaptation for ${transport}`,
      detail: 'Adapter did not map payload specifics',
      metrics: [],
    },
  ],
});

export const normalizeSignals = <TAdapters extends readonly SignalAdapter<unknown, unknown>[]>(
  adapters: TAdapters,
  envelopes: readonly SignalEnvelope[],
): IncidentSignal[] => {
  const byTransport = new Map<string, SignalAdapter<unknown, unknown>[]>();
  for (const adapter of adapters) {
    byTransport.set(adapter.transport, [...(byTransport.get(adapter.transport) ?? []), adapter]);
  }

  const output: IncidentSignal[] = [];
  for (const envelope of envelopes) {
    const handlers = byTransport.get(envelope.transport) ?? [];
    for (const handler of handlers) {
      for (const signal of handler.adapt(envelope as SignalEnvelope)) {
        output.push(signal);
      }
    }
  }
  return output;
};
