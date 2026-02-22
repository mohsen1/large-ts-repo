import type { ForecastResponse, OrchestrationInput, WorkloadOrchestrator } from './types';
import { buildForecasts, forecastSummary } from './forecast';
import type { ForecastInput } from '@domain/recovery-workload-intelligence';
import { buildTrendSeries, transformToViewRows } from '@data/recovery-workload-store';
import { fail, ok, type Result } from '@shared/result';

const clampSeverity = (value: number): 1 | 2 | 3 | 4 | 5 => {
  if (value < 2) {
    return 1;
  }
  if (value < 3) {
    return 2;
  }
  if (value < 4) {
    return 3;
  }
  if (value < 5) {
    return 4;
  }
  return 5;
};

export const createWorkloadOrchestrator = ({
  repository,
  graph,
  mode,
}: OrchestrationInput): WorkloadOrchestrator => {
  let lastResult: ForecastResponse | undefined;

  const evaluate = async (): Promise<Result<ForecastResponse, string>> => {
    const records = await repository.query({ nodeIds: [], includeDependencies: true });
    if (records.length === 0) {
      return fail('no workload records available');
    }

    const nodeInputs = records.flatMap((record) =>
      record.snapshots.map((snapshot) => ({
        node: record.node,
        snapshot,
        riskVector: {
          severity: clampSeverity(Math.round(snapshot.cpuUtilization / 15)),
          blastRadius: (record.node.criticality >= 4
            ? 'global'
            : record.node.criticality >= 3
              ? 'region'
              : 'zone') as ForecastInput['riskVector']['blastRadius'],
          customerImpact: record.node.targetSlaMinutes,
          recoveryToleranceSeconds: record.node.targetSlaMinutes * 60,
        },
        lookbackDays: 14,
      })),
    );

    if (nodeInputs.length === 0) {
      return fail('no snapshots available for forecasting');
    }

    const forecast = buildForecasts({ nodeInputs, mode, graph });
    lastResult = forecast;
    return ok(forecast);
  };

  const summary = async () => {
    const records = await repository.query({ nodeIds: [], includeDependencies: true });
    return {
      views: transformToViewRows(records),
      trend: buildTrendSeries(records, graph),
    };
  };

  const executePlan = async (incidentId: string): Promise<Result<string, string>> => {
    const output = await evaluate();
    if (!output.ok) {
      return fail(output.error);
    }

    if (!lastResult || lastResult.planGroups.length === 0) {
      return fail('no plan groups available');
    }

    const selected = lastResult.planGroups.find((entry) => entry.plan.node.id === incidentId);
    if (!selected) {
      return fail(`plan not found for ${incidentId}`);
    }

    return ok(`executed ${selected.plan.node.id}: ${forecastSummary(output.value)}`);
  };

  return {
    evaluate,
    summary: async () => summary(),
    executePlan,
  };
};
