import type {
  SignalEnvelope,
  SignalId,
  SignalVector,
  SignalPlanCandidate,
  SignalWindow,
  TenantId,
  SignalWindowInput,
} from '@domain/incident-signal-intelligence';
import {
  normalizeSignalVector,
  makeSignalId,
  makeTenantId,
  makeZoneId,
  type ZoneId,
} from '@domain/incident-signal-intelligence';
import type { SignalRepository } from './repository';

export interface InMemorySignalArchive {
  listTenantSignals(tenantId: TenantId): Promise<readonly SignalEnvelope[]>;
  listPlanSummaries(tenantId: TenantId): Promise<readonly SignalPlanCandidate[]>;
  readWindow(input: SignalWindowInput): Promise<readonly SignalWindow[]>;
}

export class SignalArchiveAdapter {
  constructor(private readonly repository: SignalRepository) {}

  async listTenantSignals(tenantId: TenantId): Promise<readonly SignalEnvelope[]> {
    const all = await this.repository.all();
    return all.filter((signal) => signal.tenantId === tenantId);
  }

  async listPlanSummaries(tenantId: TenantId): Promise<readonly SignalPlanCandidate[]> {
    const allSignals = await this.repository.all();
    const plans = await Promise.all(allSignals.map((signal) => this.repository.readPlans(signal.id)));
    return plans
      .flat()
      .filter((plan) => plan.tenantId === tenantId)
      .slice(0, 50);
  }

  async readWindow(input: SignalWindowInput): Promise<readonly SignalWindow[]> {
    const tenantSignals = await this.repository.query({ filter: { tenantId: input.tenantId } });
    const windows = await this.repository.readWindows(input);

    const normalizedWindows = windows
      .filter((window) => window.to <= input.to && window.from >= input.from)
      .map((window) => ({
        ...window,
        from: input.from,
        to: input.to,
        samples: window.samples.map((sample: SignalVector) => normalizeSignalVector(sample)),
      }));

    if (tenantSignals.length > 0) {
      return normalizedWindows;
    }

    return [
      {
        from: input.from,
        to: input.to,
        samples: [normalizeSignalVector({ magnitude: 0, variance: 0, entropy: 0 })],
      },
    ];
  }

  async buildSyntheticSnapshot(signalId: SignalId): Promise<SignalEnvelope> {
    return {
      id: makeSignalId(`snap-${signalId}`),
      tenantId: makeTenantId('default'),
      zone: makeZoneId('zone-a') as ZoneId,
      kind: 'availability',
      state: 'observed',
      vector: normalizeSignalVector({ magnitude: 0.25, variance: 0.15, entropy: 0.2 }),
      risk: 'low',
      recordedAt: new Date().toISOString(),
      correlationKeys: ['synth'],
      meta: {
        source: 'adapter',
        observedBy: 'internal',
        region: 'global',
        tags: ['synthetic', 'adapter'],
      },
    };
  }

  async loadLatestWindow(signalId: SignalId, minutes: number): Promise<SignalWindow> {
    const now = new Date();
    const from = new Date(now.getTime() - minutes * 60_000).toISOString();
    const to = now.toISOString();

    const windows = await this.readWindow({
      tenantId: makeTenantId('default'),
      signalKind: 'availability',
      from,
      to,
      limit: 4,
    });
    const target = windows[0];
    return {
      from: target?.from ?? from,
      to: target?.to ?? to,
      samples: target?.samples ?? [normalizeSignalVector({ magnitude: 0, variance: 0, entropy: 0 })],
    };
  }
}
