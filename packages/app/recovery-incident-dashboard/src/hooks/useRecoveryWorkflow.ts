import { useMemo, useState } from 'react';
import type { DashboardState, DashboardIncident } from '../types';
import type { DashboardSummary } from '../hooks/useIncidentDashboard';
import { RecoveryIncidentOrchestrator } from '@service/recovery-incident-orchestrator';
import { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { RecoveryCommandCenter } from '@service/recovery-incident-orchestrator';
import { buildSeveritySignal } from '@domain/recovery-incident-orchestration';

export interface RecoveryWorkflowStatus {
  readonly eventCount: number;
  readonly executedRuns: number;
  readonly failedRuns: number;
  readonly severityScore: number;
}

export interface RecoveryCommand {
  readonly tenantId: string;
  readonly incidentId: string;
  readonly command: 'plan' | 'execute' | 'promote' | 'refresh' | 'query';
  readonly correlationId: string;
  readonly reason?: string;
}

export interface RecoveryCommandResult {
  readonly command: RecoveryCommand;
  readonly status: 'accepted' | 'queued' | 'done' | 'rejected';
  readonly message: string;
  readonly artifacts: readonly string[];
}

export const useRecoveryWorkflow = (repo: RecoveryIncidentRepository) => {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const orchestrator = new RecoveryIncidentOrchestrator({ repo });
  const commandCenter = new RecoveryCommandCenter({
    repository: repo,
    orchestrator,
  });

  const sendCommand = async (command: RecoveryCommand): Promise<RecoveryCommandResult> => {
    setLoading(true);
    try {
      const result = await commandCenter.execute(command);
      setEvents((previous) => [...previous, `${command.command}:${result.status}:${command.incidentId}`]);
      return {
        command,
        status: result.status,
        message: result.message,
        artifacts: result.artifacts,
      };
    } finally {
      setLoading(false);
    }
  };

  const summarizeStatus = (state: DashboardState, summary: DashboardSummary): RecoveryWorkflowStatus => {
    const runCount = state.runs.length;
    const failed = state.runs.filter((run) => run.state === 'failed').length;
    const severitySignals = summary.recentIncidentIds
      .map((incidentId) => state.incidents.find((item): item is DashboardIncident => item.id === incidentId))
      .filter((incident): incident is DashboardIncident => Boolean(incident))
      .flatMap((incident) => buildSeveritySignal(incident).weightedSignals)
      .reduce((total, signal) => total + signal.normalizedValue, 0);

    return {
      eventCount: events.length,
      executedRuns: runCount,
      failedRuns: failed,
      severityScore: Number((severitySignals / Math.max(1, summary.recentIncidentIds.length)).toFixed(4)),
    };
  };

  const summary = useMemo(
    () => ({
      running: loading,
      eventCount: events.length,
      hasEvents: events.length > 0,
    }),
    [loading, events.length],
  );

  return { sendCommand, summarizeStatus, summary };
};
