import { useMemo } from 'react';
import type { ReactElement } from 'react';

import type { IncidentGraph } from '@domain/recovery-incident-graph';
import { analyzeCriticalPath, buildGraphAnalysisReport, calculateRiskHotspots } from '@domain/recovery-incident-graph';

interface CriticalPathProps {
  readonly graph: IncidentGraph;
}

interface PathRowProps {
  readonly from: string;
  readonly to: string;
  readonly score: number;
}

const PathRow = ({ from, to, score }: PathRowProps): ReactElement => {
  const risk = score > 20 ? 'high' : score > 10 ? 'medium' : 'low';
  return (
    <li>
      <code>{from}</code> → <code>{to}</code> ({risk}, score={score.toFixed(2)})
    </li>
  );
};

export const RecoveryIncidentGraphCriticalPath = ({ graph }: CriticalPathProps): ReactElement => {
  const criticalPath = useMemo(() => analyzeCriticalPath(graph), [graph]);
  const report = useMemo(() => buildGraphAnalysisReport(graph), [graph]);
  const heatPoints = useMemo(() => calculateRiskHotspots(graph), [graph]);

  return (
    <section aria-label="recovery-incident-graph-critical-path">
      <h3>Critical Path</h3>
      <p>
        Cluster count: {report.clusterCount} · Longest level: {report.longestLevel} · Ready nodes: {report.readyNodes.length}
      </p>
      <ol>
        {criticalPath.map((edge) => (
          <PathRow key={`${edge.from}-${edge.to}`} from={edge.from} to={edge.to} score={edge.score} />
        ))}
      </ol>
      <h4>Risk Heat</h4>
      <table>
        <thead>
          <tr>
            <th>Node</th>
            <th>Depth</th>
            <th>In</th>
            <th>Out</th>
            <th>Risk</th>
          </tr>
        </thead>
        <tbody>
          {heatPoints.map((point) => (
            <tr key={point.nodeId}>
              <td>{point.nodeId}</td>
              <td>{point.depth}</td>
              <td>{point.inbound}</td>
              <td>{point.outbound}</td>
              <td>{(point.risk.severity * 100).toFixed(1)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
};
