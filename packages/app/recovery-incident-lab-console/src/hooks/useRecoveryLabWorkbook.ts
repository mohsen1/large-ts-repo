import { useEffect, useMemo, useState } from 'react';
import type { IncidentLabScenario, IncidentLabPlan, IncidentLabRun, IncidentLabSignal, PlanRiskScore } from '@domain/recovery-incident-lab-core';
import { InMemoryRecoveryIncidentLabRepository, type RecoveryIncidentLabRepository } from '@data/recovery-incident-lab-store';
import { makeWorkbook, toWorkbookText, type Workbook } from '@service/recovery-incident-lab-orchestrator';
import { validateScenario, validatePlan, summarizeSignalTrends } from '@domain/recovery-incident-lab-core';

interface State {
  readonly scenario?: IncidentLabScenario;
  readonly plan?: IncidentLabPlan;
  readonly run?: IncidentLabRun;
  readonly signals: readonly IncidentLabSignal[];
  readonly workbook?: Workbook;
  readonly status: 'idle' | 'ready' | 'invalid' | 'loaded';
}

const computeSignals = (run?: IncidentLabRun): readonly IncidentLabSignal[] =>
  run
    ? run.results.flatMap((result, index) =>
        result.sideEffects.flatMap((sideEffect) => {
          if (sideEffect === 'signal') {
            return [];
          }
          return [
            {
              kind: index % 2 === 0 ? 'capacity' : 'latency',
              node: String(result.stepId),
              value: result.logs.join('').length,
              at: result.startAt,
            },
          ];
        }),
      )
    : [];

export const useRecoveryLabWorkbook = (repository: RecoveryIncidentLabRepository = new InMemoryRecoveryIncidentLabRepository()) => {
  const [state, setState] = useState<State>({
    signals: [],
    status: 'idle',
  });
  const [risk, setRisk] = useState<PlanRiskScore | undefined>(undefined);

  useEffect(() => {
    let active = true;
    const hydrate = async () => {
      const scenarios = await repository.listScenarios();
      const scenario = scenarios.items[0];
      if (!scenario) {
        setState((prev: State) => ({ ...prev, status: 'invalid' }));
        return;
      }
      const plansQuery = await repository.listPlansByScenario(scenario.id);
      const plan = plansQuery.items[0];
      const runsQuery = await repository.listRuns({ scenarioId: scenario.id });
      const run = runsQuery.items[0];

      const signals = computeSignals(run);
      const workbook = scenario && plan ? makeWorkbook(scenario, plan, run, signals) : undefined;
      const workbookRisk = scenario && plan ? (workbook as Workbook).risk : undefined;
      if (active && scenario && plan) {
        setState({
          scenario,
          plan,
          run,
          signals,
          workbook,
          status: 'loaded',
        });
        setRisk(workbookRisk);
      }
    };

    void hydrate().catch(() => undefined);
    return () => {
      active = false;
    };
  }, [repository]);

  const isValid = useMemo(() => {
    if (!state.scenario || !state.plan) {
      return false;
    }
    const scenarioValidation = validateScenario(state.scenario);
    const planValidation = validatePlan(state.plan);
    return scenarioValidation.ok && planValidation.ok;
  }, [state.scenario, state.plan]);

  const summary = useMemo(() => {
    if (!state.workbook) {
      return 'workbook pending';
    }
    return toWorkbookText(state.workbook);
  }, [state.workbook]);

  const signalSummary = useMemo(() => summarizeSignalTrends(state.signals), [state.signals]);

  return {
    state,
    isValid,
    summary,
    risk,
    signalSummary,
  };
};
