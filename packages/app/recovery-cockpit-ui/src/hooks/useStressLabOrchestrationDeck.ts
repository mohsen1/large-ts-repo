import { useCallback, useMemo, useState } from 'react';
import { type SeverityBand, type TenantId } from '@domain/recovery-stress-lab';
import { runSignalOrchestrator, type SignalOrchestratorInput, type SignalOrchestratorOutput } from '@service/recovery-stress-lab-orchestrator';
import { type WorkloadTopology } from '@domain/recovery-stress-lab';

type DeckRunbook = {
  readonly id: string;
  readonly title: string;
  readonly selected: boolean;
};

type DeckSignal = {
  readonly id: string;
  readonly severity: SeverityBand;
};

type DeckTrace = {
  readonly when: string;
  readonly plugin: string;
  readonly status: 'ok' | 'warn' | 'skip';
};

export interface UseStressLabDeckOptions {
  readonly tenantId: TenantId;
  readonly topology: WorkloadTopology;
  readonly initialRunbooks: readonly string[];
  readonly band?: SeverityBand;
}

export interface StressLabDeckState {
  readonly runbooks: readonly DeckRunbook[];
  readonly selectedBand: SeverityBand;
  readonly outputs: readonly SignalOrchestratorOutput[];
  readonly traces: readonly DeckTrace[];
  readonly signals: readonly DeckSignal[];
}

const defaultRunbooks = (values: readonly string[]) =>
  values.map((runbook) => ({ id: runbook, title: `runbook:${runbook}`, selected: true }));

const routeFromTrace = (tenantId: TenantId, outputs: readonly SignalOrchestratorOutput[]) =>
  `${tenantId}::${outputs.length}`;

export const useStressLabOrchestrationDeck = (options: UseStressLabDeckOptions) => {
  const [outputs, setOutputs] = useState<readonly SignalOrchestratorOutput[]>([]);
  const [runbooks, setRunbooks] = useState<readonly DeckRunbook[]>(() => defaultRunbooks(options.initialRunbooks));
  const [selectedBand, setSelectedBand] = useState<SeverityBand>(options.band ?? 'critical');
  const [traces, setTraces] = useState<readonly DeckTrace[]>([]);

  const signals = useMemo<readonly DeckSignal[]>(
    () => [
      { id: `${options.tenantId}:signal-1`, severity: selectedBand },
      { id: `${options.tenantId}:signal-2`, severity: selectedBand === 'critical' ? 'high' : 'critical' },
    ],
    [options.tenantId, selectedBand],
  );

  const enrichTraces = useCallback((output: SignalOrchestratorOutput, tenantId: TenantId): readonly DeckTrace[] => {
    return output.chain.events.map((event): DeckTrace => ({
      when: new Date().toISOString(),
      plugin: String(event.plugin),
      status: event.status === 'warn' ? 'warn' : 'ok',
    })).concat({
      when: new Date().toISOString(),
      plugin: `route:${routeFromTrace(tenantId, outputs)}`,
      status: outputs.length === 0 ? 'warn' : 'ok',
    } satisfies DeckTrace);
  }, [outputs]);

  const run = useCallback(async (): Promise<SignalOrchestratorOutput> => {
    const payload: SignalOrchestratorInput = {
      tenantId: options.tenantId,
      topology: options.topology,
      band: selectedBand,
      selectedRunbooks: runbooks.filter((runbook) => runbook.selected).map((runbook) => runbook.id),
      selectedSignals: [],
      rawSignals: [
        { id: `${options.tenantId}:signal-run`, tenantId: options.tenantId, class: 'availability', severity: selectedBand, title: 'runtime', metadata: {} },
      ],
      targets: [],
    };
    const output = await runSignalOrchestrator(payload);
    setOutputs((previous) => [...previous, output]);
    setTraces((previous) => [...previous, ...enrichTraces(output, options.tenantId)]);
    return output;
  }, [options.tenantId, options.topology, runbooks, selectedBand, enrichTraces]);

  const rerun = useCallback(async (): Promise<SignalOrchestratorOutput | undefined> => {
    const latest = outputs[outputs.length - 1];
    if (!latest) {
      return undefined;
    }
    const payload: SignalOrchestratorInput = {
      tenantId: options.tenantId,
      topology: options.topology,
      band: selectedBand,
      selectedRunbooks: latest.plan
        ? latest.plan.runbooks.map((runbook) => String(runbook.id))
        : runbooks.filter((runbook) => runbook.selected).map((runbook) => runbook.id),
      selectedSignals: [],
      rawSignals: [
        { id: `${options.tenantId}:signal-rerun`, tenantId: options.tenantId, class: 'availability', severity: selectedBand, title: 'rerun', metadata: {} },
      ],
      targets: [],
    };
    const output = await runSignalOrchestrator(payload);
    setOutputs((previous) => [...previous, output]);
    setTraces((previous) => [...previous, ...enrichTraces(output, options.tenantId)]);
    return output;
  }, [enrichTraces, options.tenantId, options.topology, outputs, runbooks, selectedBand]);

  const toggleRunbook = useCallback((runbookId: string) => {
    setRunbooks((current) =>
      current.map((runbook) => (runbook.id === runbookId ? { ...runbook, selected: !runbook.selected } : runbook)),
    );
  }, []);

  const setBand = useCallback((band: SeverityBand) => {
    setSelectedBand(band);
  }, []);

  return {
    state: {
      runbooks,
      selectedBand,
      outputs,
      traces,
      signals,
    } satisfies StressLabDeckState,
    run,
    rerun,
    toggleRunbook,
    setBand,
  };
};
