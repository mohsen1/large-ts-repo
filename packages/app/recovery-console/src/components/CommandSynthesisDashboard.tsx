import { useMemo } from 'react';
import type { CommandSynthesisResult, CommandSynthesisPlan } from '@service/recovery-fusion-orchestrator';
import type { CommandSynthesisResult as DomainSynthesisResult } from '@domain/recovery-command-orchestration';

interface CommandSynthesisDashboardProps {
  readonly plan?: CommandSynthesisPlan;
  readonly result?: CommandSynthesisResult | DomainSynthesisResult;
  readonly running: boolean;
  readonly onReplay: () => void;
  readonly onReset: () => void;
}

const readinessColor = (score: number) => {
  if (score >= 85) return 'green';
  if (score >= 65) return 'amber';
  return 'red';
};

export const CommandSynthesisDashboard = ({
  plan,
  result,
  running,
  onReplay,
  onReset,
}: CommandSynthesisDashboardProps) => {
  const summary = useMemo(() => {
    if (!result) return undefined;
    return {
      color: readinessColor(result.readinessScore),
      conflicts: result.conflicts.length,
      forecast: result.forecastMinutes,
      queue: result.executionOrder.length,
      ready: result.ready ? 'yes' : 'no',
      criticalCount: result.criticalPaths.length,
    };
  }, [result]);

  return (
    <section className="command-synthesis-dashboard">
      <h2>Command orchestration synthesis</h2>
      <p>Tenant: {plan?.tenant ?? 'n/a'}</p>
      <p>Run: {plan?.runId ?? 'none'}</p>
      <p>Graph: {plan?.graphId ?? 'none'}</p>
      <p>Requested by: {plan?.requestedBy ?? 'unknown'}</p>
      <p>Readiness: {summary?.ready ?? 'idle'}</p>
      {summary && (
        <>
          <p>Readiness score: {summary.color}</p>
          <p>Conflicts: {summary.conflicts}</p>
          <p>Forecast minutes: {summary.forecast}</p>
          <p>Queued nodes: {summary.queue}</p>
          <p>Critical path length: {summary.criticalCount}</p>
        </>
      )}
      <div>
        <button type="button" onClick={onReplay} disabled={running}>
          Replay command graph
        </button>
        <button type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </section>
  );
};
