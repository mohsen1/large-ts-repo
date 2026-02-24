import { useMemo } from 'react';
import type { WorkloadTopology } from '@domain/recovery-stress-lab';
import type { MeshHealthSummary } from '@service/recovery-stress-lab-orchestrator';

export interface StressLabPolicyBoardProps {
  readonly tenantId: string;
  readonly band: 'low' | 'medium' | 'high' | 'critical';
  readonly topology: WorkloadTopology;
  readonly report: MeshHealthSummary | null;
}

interface MetricRow {
  readonly label: string;
  readonly value: string | number;
  readonly tone: 'ok' | 'warn' | 'alert';
}

const toTone = (value: string | number, threshold: number): MetricRow['tone'] => {
  if (typeof value === 'number') {
    if (value >= threshold) return 'ok';
    if (value >= threshold / 2) return 'warn';
    return 'alert';
  }
  return value ? 'ok' : 'warn';
};

const buildRows = (report: MeshHealthSummary | null, topology: WorkloadTopology): MetricRow[] => {
  const routeCount = report?.routeCount ?? 0;
  const readinessScore = report ? report.readynessScore : 0;
  const driftRisk = report ? report.driftRisk : 0;
  const reasons = report?.readinessReasons ?? [];
  const runbooks = report ? report.runbookPriority.length : 0;
  const topologyWeight = topology.nodes.length;
  return [
    { label: 'Routes', value: routeCount, tone: toTone(routeCount, 1) },
    { label: 'Readiness score', value: Number(readinessScore.toFixed(2)), tone: toTone(readinessScore, 5) },
    { label: 'Drift risk', value: Number(driftRisk.toFixed(2)), tone: toTone(Math.abs(driftRisk), 0.5) },
    { label: 'Runbooks prioritized', value: runbooks, tone: toTone(runbooks, 1) },
    { label: 'Topology nodes', value: topologyWeight, tone: toTone(topologyWeight, 1) },
    { label: 'Readiness reasons', value: reasons.length, tone: toTone(6 - reasons.length, 1) },
  ];
};

export const StressLabPolicyBoard = ({ tenantId, band, topology, report }: StressLabPolicyBoardProps) => {
  const rows = useMemo(() => buildRows(report, topology), [report, topology]);
  const summary = useMemo(() => report?.readinessReasons.slice(0, 3) ?? [], [report]);

  return (
    <section>
      <h3>Policy Board</h3>
      <p>
        tenant={tenantId} · band={band} · nodes={topology.nodes.length} · edges={topology.edges.length}
      </p>
      <table>
        <thead>
          <tr>
            <th>Metric</th>
            <th>Value</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td>{row.label}</td>
              <td>{typeof row.value === 'number' ? row.value.toLocaleString() : row.value}</td>
              <td>{row.tone}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {summary.length > 0 ? (
        <ul>
          {summary.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p>No blockers</p>
      )}
    </section>
  );
};
