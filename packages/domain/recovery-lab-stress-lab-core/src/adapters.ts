import type { Brand } from '@shared/orchestration-lab-core';
import { toPluginRunId, toRunPlanId, toTenantId } from '@shared/orchestration-lab-core';
import type { RecoverySignal } from '@shared/orchestration-lab-core';
import { toSignalId } from '@shared/orchestration-lab-core';
import type { ChaosRuntimeSignal } from './contracts';
import { toIncidentId } from './types';
import type { CommandId, IncidentId, LabMode, LabPlanInput } from './types';

export interface AdapterSeed {
  readonly tenant: string;
  readonly mode: LabMode;
  readonly labels: readonly string[];
}

const asCommandId = (seed: AdapterSeed): CommandId => `${seed.tenant}:${seed.mode}:${Date.now()}` as CommandId;
const asRunId = (seed: AdapterSeed): string => `${seed.tenant}:${seed.mode}:${Date.now()}`;
const asFingerprint = (seed: AdapterSeed, label: string, index: number): string =>
  `${seed.tenant}:${seed.mode}:${label}:${index}`;
const asRuntimeFingerprint = (seed: AdapterSeed, label: string, index: number): Brand<string, 'SignalHash'> =>
  asFingerprint(seed, label, index) as Brand<string, 'SignalHash'>;
const toRecoveryCategory = (seed: AdapterSeed, label: string): `telemetry:${string}` => `telemetry:${seed.mode}:${label}`;
const toRuntimeCategory = (seed: AdapterSeed, label: string): `signal:${string}` => `signal:${seed.mode}:${label}`;

const toIncident = (tenant: string, label: string): IncidentId => toIncidentId(`incident:${tenant}:${label}`);

const toChaosRuntimeSignal = (seed: AdapterSeed, label: string, index: number): ChaosRuntimeSignal => ({
  category: toRuntimeCategory(seed, label),
  severity: (index % 2 === 0 ? 'severity:critical' : 'severity:high') as ChaosRuntimeSignal['severity'],
  fingerprint: asRuntimeFingerprint(seed, label, index),
  mode: seed.mode,
  tenant: toTenantId(seed.tenant),
});

export const buildAdapterSignals = (seed: AdapterSeed): readonly ChaosRuntimeSignal[] =>
  seed.labels.map((label, index) => toChaosRuntimeSignal(seed, label, index));

export const buildPlanFromAdapter = (seed: AdapterSeed, signals: readonly ChaosRuntimeSignal[]): LabPlanInput => {
  const now = new Date().toISOString();
  return {
    runId: toRunPlanId(asRunId(seed)),
    commandId: asCommandId(seed),
    tenant: toTenantId(seed.tenant),
    title: `Adapter Plan ${seed.mode}`,
    window: {
      from: now,
      to: new Date(Date.now() + 45 * 60 * 1000).toISOString(),
      timezone: 'UTC',
    },
    mode: seed.mode,
    signals: signals.map((signal, index) => ({
      id: toSignalId(`${seed.tenant}:${seed.mode}:${signal.fingerprint}:${index}`),
      incident: toIncident(seed.tenant, index.toString(10)),
      tenant: toTenantId(seed.tenant),
      category: toRecoveryCategory(seed, `${seed.mode}:${index}`),
      severity: signal.severity.replace('severity:', '') as RecoverySignal['severity'],
      channel: 'telemetry',
      source: seed.tenant,
      value: 0.1 * (String(signal.fingerprint).length % 10),
      tags: [seed.mode, String(signal.fingerprint)],
      metadata: { adapter: seed.mode },
    })),
    metadata: {
      adapter: 'true',
      mode: seed.mode,
    },
  };
};

export const normalizeAdapterOutput = <TOutput extends { title: string }>(input: TOutput): TOutput => ({
  ...input,
  title: `normalized:${input.title}`,
});
