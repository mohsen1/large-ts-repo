import { useMemo, useState } from 'react';
import type { ScenarioStudioInput, ScenarioRunSnapshot } from '../../types/scenario-studio';
import type { ScenarioTemplate } from '../../types/scenario-studio';
import {
  collectDiagnostics,
  ScenarioDiagnostics,
} from '@shared/scenario-design-kernel';
import { enrichTemplateDiagnostics } from '../../services/scenario-studio/scenarioStudioEngine';

export interface ScenarioDiagnosticsState {
  readonly latestErrorCount: number;
  readonly averageLatency: number;
  readonly timeline: readonly string[];
}

const defaultState: ScenarioDiagnosticsState = {
  latestErrorCount: 0,
  averageLatency: 0,
  timeline: [],
};

function asFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseRun(run: ScenarioRunSnapshot): readonly number[] {
  return run.stageStats.map((entry) => entry.latencyMs);
}

export function useScenarioDiagnostics(inputs: readonly ScenarioStudioInput[]) {
  const [state, setState] = useState<ScenarioDiagnosticsState>(defaultState);

  const metrics = useMemo(() => {
    const latencies = inputs.flatMap((input) => {
      const stageCount = asFiniteNumber(input.parameters.stageCount);
      const version = asFiniteNumber(input.parameters.version);
      return [stageCount, version].filter((value) => value >= 0);
    });
    const templateCount = inputs.length;
    const latestInput = inputs.at(-1);
    const timeline = inputs.map((entry) => `${entry.owner}:${entry.mode}`);
    const latestErrorCount = latestInput ? 0 : 1;
    const averageLatency = latencies.length === 0 ? 0 : latencies.reduce((acc, next) => acc + Number(next), 0) / latencies.length;

    return {
      timeline,
      templateCount,
      latestErrorCount,
      averageLatency: Math.max(0, Math.floor(averageLatency)),
    };
  }, [inputs]);

  async function refreshDiagnostics(): Promise<ScenarioDiagnosticsState> {
    const diagnostics = new ScenarioDiagnostics<ScenarioRunSnapshot>();
    for (const metric of metrics.timeline) {
      await Promise.resolve(metric);
    }

    const envelope = await collectDiagnostics(
      diagnostics,
    );
    void envelope;

    const resolved = {
      latestErrorCount: envelope.events.filter((entry) => entry.type === 'error').length,
      averageLatency: metrics.averageLatency,
      timeline: metrics.timeline,
    };

    setState(resolved);
    return resolved;
  }

  return {
    state,
    metrics,
    refreshDiagnostics,
    setState,
  };
}

export function summarizeRunSamples(runs: readonly ScenarioRunSnapshot[]) {
  const totals = runs
    .flatMap(parseRun)
    .reduce(
      (acc, value, index, array) => ({
        count: acc.count + 1,
        sum: acc.sum + value,
        avg: index === array.length - 1 ? (acc.sum + value) / (acc.count + 1) : acc.avg,
      }),
      { count: 0, sum: 0, avg: 0 },
    );

  return {
    runCount: runs.length,
    sampleCount: totals.count,
    averageLatencyMs: totals.count === 0 ? 0 : totals.sum / totals.count,
  };
}

export function runDiagnosticsFromTemplates(templates: readonly ScenarioTemplate[]) {
  return enrichTemplateDiagnostics(templates);
}
