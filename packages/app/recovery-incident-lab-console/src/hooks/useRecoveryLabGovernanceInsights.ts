import { useEffect, useState } from 'react';
import {
  evaluateLabPolicy,
  buildPolicyBridgeEnvelope,
  collectSignalBatches,
} from '@domain/recovery-incident-lab-core';
import { useRecoveryIncidentLabWorkspace } from './useRecoveryIncidentLabWorkspace';
import { buildRegistryAdapter } from '../adapters/recoveryLabRegistryAdapter';

export interface GovernanceInsight {
  readonly scenarioId: string;
  readonly readiness: number;
  readonly warnings: readonly string[];
  readonly batches: readonly {
    readonly kind: string;
    readonly bucket: string;
    readonly values: readonly number[];
  }[];
  readonly adapterKey: string;
}

const summarizeWarnings = (values: readonly string[]): readonly string[] =>
  values.toSorted().filter((entry, index, all) => index === 0 || all[index - 1] !== entry);

export const useRecoveryLabGovernanceInsights = (): GovernanceInsight => {
  const workspace = useRecoveryIncidentLabWorkspace();
  const [batches, setBatches] = useState<GovernanceInsight['batches']>([]);
  const [adapterKey, setAdapterKey] = useState<string>('pending');
  const [warnings, setWarnings] = useState<readonly string[]>(['waiting']);
  const [readiness, setReadiness] = useState<number>(0);

  const scenario = workspace.state.scenario;
  const plan = workspace.plan;

  useEffect(() => {
    if (!scenario || !plan) {
      setReadiness(0);
      setWarnings(['missing-workspace']);
      setBatches([]);
      setAdapterKey('n/a');
      return;
    }

    const signals = ['capacity', 'latency', 'integrity', 'dependency'] as const;
    const policy = evaluateLabPolicy({
      scenario,
      plan,
      signals,
      governanceSignals: [],
    });
    const baseSignals = signals.map((signal, index) => ({
      kind: signal,
      node: `node-${index}`,
      value: index + 1,
      at: new Date(Date.now() + index).toISOString(),
    }));

    setReadiness(policy.readinessScore);

    const nextWarnings = summarizeWarnings([
      ...policy.warnings,
      `baseSignals:${baseSignals.length}`,
      `scenario:${scenario.id}`,
    ]);
    setWarnings(nextWarnings);

    let active = true;
    void (async () => {
      const preparedBatches = await collectSignalBatches(baseSignals);
      const envelope = await buildPolicyBridgeEnvelope({
        scenario,
        plan,
        signals,
        governanceSignals: [],
      });

      const registry = await buildRegistryAdapter({
        namespace: `governance:${scenario.id}`,
        scenarioId: String(scenario.id),
        counts: [plan.selected.length, plan.queue.length, Math.max(1, preparedBatches.length)],
      });

      if (!active) {
        return;
      }
      setBatches(preparedBatches);
      setAdapterKey(registry.key);
      setWarnings((current) =>
        summarizeWarnings([...current, `bridge:${envelope.readiness.readiness}`, `tenant:${String(envelope.tenant)}`]),
      );
    })();

    return () => {
      active = false;
    };
  }, [scenario, plan]);

  return {
    scenarioId: scenario?.id ?? 'unbound',
    readiness,
    warnings,
    batches,
    adapterKey,
  };
};
