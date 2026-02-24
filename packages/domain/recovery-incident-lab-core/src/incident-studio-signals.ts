import { Brand, withBrand } from '@shared/core';
import { NoInfer } from '@shared/type-level';
import type { IncidentLabSignal, IncidentLabEnvelope, LabTemplateStep } from './types';
import {
  type CommandRunbook,
  type CommandStep,
  type RecoverySignal,
  type RecoverySignalId,
  type SignalClass,
  type SeverityBand as StressSeverityBand,
  type CommandStepId,
} from '@domain/recovery-stress-lab';

export const signalWindowSizes = [5, 8, 13, 21, 34] as const;
export type SignalWindowSize = (typeof signalWindowSizes)[number];

export type SignalEnvelopeId = Brand<string, 'IncidentLabStudioSignalEnvelopeId'>;

export interface SignalLaneSnapshot<TKind extends SignalClass = SignalClass> {
  readonly kind: TKind;
  readonly signature: `${TKind}:low` | `${TKind}:medium` | `${TKind}:high` | `${TKind}:critical`;
  readonly count: number;
  readonly maxValue: number;
  readonly minValue: number;
  readonly values: readonly IncidentLabSignal[];
}

export type IncidentStudioSignalWindowKey = `${SignalClass}:window`;
export type SignalBucketsByClass<TSignals extends readonly SignalClass[]> = {
  [TSignal in TSignals[number] as `lane:${TSignal}`]: SignalLaneSnapshot<TSignal>;
};

export type SignalEnvelopeSeries = readonly {
  readonly signature: string;
  readonly window: readonly [IncidentLabSignal];
  readonly key: IncidentStudioSignalWindowKey;
  readonly kind: SignalClass;
}[];

export interface ScenarioSignalEnvelope<TPayload = unknown> extends IncidentLabEnvelope<TPayload> {
  readonly signalEnvelopeId: SignalEnvelopeId;
}

const severityRank: Record<StressSeverityBand, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

const toIncidentLabKind = (input: SignalClass): IncidentLabSignal['kind'] => {
  switch (input) {
    case 'availability':
      return 'capacity';
    case 'performance':
      return 'latency';
    case 'integrity':
      return 'integrity';
    case 'compliance':
      return 'dependency';
  }
};

const toSeverityBand = (input: number): StressSeverityBand => {
  if (input >= 4) return 'critical';
  if (input >= 3) return 'high';
  if (input >= 2) return 'medium';
  return 'low';
};

export const normalizeClassWindow = (value: string): SignalClass => value as SignalClass;

export const toIncidentLabSignal = (signal: RecoverySignal): IncidentLabSignal => ({
  kind: toIncidentLabKind(signal.class),
  node: signal.id as unknown as string,
  value: severityRank[signal.severity],
  at: new Date(signal.createdAt).toISOString(),
});

export const normalizeSignalWindow = (raw: readonly RecoverySignal[]): readonly IncidentLabSignal[] =>
  raw
    .map((signal) => toIncidentLabSignal(signal))
    .map((signal) => ({ ...signal, node: String(signal.node).trim().toLowerCase() }))
    .toSorted((left, right) => right.value - left.value || left.node.localeCompare(right.node));

export const projectSignalBuckets = <const TSignals extends readonly SignalClass[]>(
  input: {
    readonly signals: readonly IncidentLabSignal[];
    readonly include: NoInfer<TSignals>;
  },
): SignalBucketsByClass<TSignals> => {
  const buckets = new Map<SignalClass, IncidentLabSignal[]>();

  for (const signal of input.signals) {
    const key = (signal.kind === 'capacity'
      ? 'availability'
      : signal.kind === 'latency'
        ? 'performance'
        : signal.kind === 'integrity'
          ? 'integrity'
          : 'compliance') as SignalClass;

    if (!input.include.includes(key)) {
      continue;
    }

    buckets.set(key, [...(buckets.get(key) ?? []), signal]);
  }

  const reduced = {
    'lane:availability': {
      kind: 'availability',
      signature: 'availability:low',
      count: 0,
      maxValue: 0,
      minValue: 0,
      values: [] as readonly IncidentLabSignal[],
    },
    'lane:integrity': {
      kind: 'integrity',
      signature: 'integrity:low',
      count: 0,
      maxValue: 0,
      minValue: 0,
      values: [] as readonly IncidentLabSignal[],
    },
    'lane:performance': {
      kind: 'performance',
      signature: 'performance:low',
      count: 0,
      maxValue: 0,
      minValue: 0,
      values: [] as readonly IncidentLabSignal[],
    },
    'lane:compliance': {
      kind: 'compliance',
      signature: 'compliance:low',
      count: 0,
      maxValue: 0,
      minValue: 0,
      values: [] as readonly IncidentLabSignal[],
    },
  } as Record<string, { kind: SignalClass; signature: string; count: number; maxValue: number; minValue: number; values: readonly IncidentLabSignal[] }>;

  for (const [kind, events] of buckets.entries()) {
    const lane = `lane:${kind}` as keyof SignalBucketsByClass<TSignals>;
    const values = events.slice(0, signalWindowSizes[0]);
    const maxValue = values.length === 0 ? 0 : Math.max(...values.map((entry) => entry.value));
    const minValue = values.length === 0 ? 0 : Math.min(...values.map((entry) => entry.value));
    const signature = `${kind}:${toSeverityBand(
      Math.min(4, Math.round(values.reduce((sum, entry) => sum + entry.value, 0) / Math.max(1, values.length))),
    )}` as SignalLaneSnapshot<SignalClass>['signature'];

    reduced[lane] = {
      kind,
      signature,
      count: values.length,
      maxValue,
      minValue,
      values,
    };
  }

  for (const bucket of input.include) {
    const lane = `lane:${bucket}` as keyof SignalBucketsByClass<TSignals>;
    if (!reduced[lane]) {
      reduced[lane] = {
        kind: bucket,
        signature: `${bucket}:low` as SignalLaneSnapshot<TSignals[number]>['signature'],
        count: 0,
        maxValue: 0,
        minValue: 0,
        values: [],
      };
    }
  }

  return reduced as unknown as SignalBucketsByClass<TSignals>;
};

export const buildIncidentSignalBuckets = <const TSignals extends readonly SignalClass[]>(
  input: {
    readonly signals: readonly RecoverySignal[];
    readonly include: NoInfer<TSignals>;
  },
): SignalBucketsByClass<TSignals> => {
  const include = [...input.include] as TSignals;
  const normalized = normalizeSignalWindow(input.signals);

  return projectSignalBuckets({
    signals: normalized,
    include,
  });
};

export const buildSignalEnvelope = <T>(input: {
  readonly sessionId: string;
  readonly scenarioId: string;
  readonly lane: string;
  readonly values: readonly IncidentLabSignal[];
  readonly payload: T;
}): ScenarioSignalEnvelope<T> => ({
  id: withBrand(`${input.sessionId}:signal-envelope`, 'EnvelopeId') as ScenarioSignalEnvelope<T>['id'],
  labId: withBrand(`${input.scenarioId}:lab`, 'IncidentLabId'),
  scenarioId: withBrand(input.scenarioId, 'ScenarioId'),
  payload: { ...input.payload, lane: input.lane, count: input.values.length } as T,
  createdAt: new Date().toISOString(),
  origin: `signal-lane:${input.lane}`,
  signalEnvelopeId: withBrand(`${input.sessionId}:lane:${input.lane}`, 'IncidentLabStudioSignalEnvelopeId'),
});

export const flattenSignalEnvelope = <T>(envelope: ScenarioSignalEnvelope<T>): {
  readonly payload: T;
  readonly lane: string;
  readonly eventId: RecoverySignalId;
  readonly signature: string;
} => ({
  payload: envelope.payload,
  lane: envelope.signalEnvelopeId,
  eventId: withBrand(`${envelope.signalEnvelopeId}:event`, 'RecoverySignalId'),
  signature: `${envelope.id}:${envelope.scenarioId}:${envelope.createdAt}`,
});

export const signalEnvelopeIterator = (envelopes: readonly IncidentLabEnvelope<unknown>[]): readonly string[] => {
  const seen = new Set<string>();
  return envelopes
    .map((frame) => frame.id)
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
};

export const mapSignalSeries = (
  signals: readonly IncidentLabSignal[],
  labels: readonly { readonly bucket: IncidentLabSignal['kind']; readonly label: string }[],
): readonly string[] => {
  return labels
    .flatMap((item) => signals.filter((signal) => signal.kind === item.bucket).map((signal) => `${item.label}:${signal.node}`))
    .slice(0, 64);
};

export const toStudioSignalWindow = (signal: IncidentLabSignal): {
  readonly signature: string;
  readonly window: readonly [IncidentLabSignal];
  readonly key: IncidentStudioSignalWindowKey;
  readonly kind: SignalClass;
} => {
  const kind =
    signal.kind === 'capacity'
      ? 'availability'
      : signal.kind === 'latency'
        ? 'performance'
        : signal.kind === 'integrity'
          ? 'integrity'
          : 'compliance';

  return {
    signature: `${signal.kind}:${signal.node}`,
    window: [signal],
    key: `${kind}:window`,
    kind,
  };
};

export const topologicalSignalWindow = (input: readonly CommandRunbook[]): readonly LabTemplateStep[] => {
  const steps: LabTemplateStep[] = [];
  for (const runbook of input) {
    for (const [index, step] of runbook.steps.entries()) {
      const dependencies = step.prerequisites.map((prerequisite: CommandStepId) =>
        withBrand(String(prerequisite), 'StepId'),
      );

      steps.push({
        id: withBrand(`${step.commandId}:${step.phase}:${runbook.id}:${index}`, 'StepId'),
        label: step.title,
        command: `${step.phase}:${step.commandId}`,
        expectedDurationMinutes: step.estimatedMinutes,
        dependencies,
        constraints: [
          {
            key: 'phase-order',
            operator: 'eq',
            value: dependencies.length,
          },
        ],
        owner: withBrand(`incident-lab-studio:${runbook.ownerTeam}`, 'ActorId'),
      });
    }
  }

  return steps.toSorted((left, right) => left.command.localeCompare(right.command));
};

export const projectRecoverySignals = (input: readonly RecoverySignal[]): readonly SignalClass[] => {
  const uniq = new Set<SignalClass>();
  for (const signal of input) {
    uniq.add(signal.class);
  }

  return [...uniq].toSorted((left, right) => left.localeCompare(right));
};
