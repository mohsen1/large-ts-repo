import type { RecoveryRunbook } from '@domain/recovery-orchestration-design';

interface TopologyDigestCardProps {
  readonly runbook: RecoveryRunbook;
}

export const TopologyDigestCard = ({ runbook }: TopologyDigestCardProps) => {
  const nodeGroups = runbook.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.phase] = (acc[node.phase] ?? 0) + 1;
    return acc;
  }, {});
  const severityGroups = runbook.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.severity] = (acc[node.severity] ?? 0) + 1;
    return acc;
  }, {});
  const statusGroups = runbook.nodes.reduce<Record<string, number>>((acc, node) => {
    acc[node.status] = (acc[node.status] ?? 0) + 1;
    return acc;
  }, {});
  const links = runbook.edges.length;
  return (
    <section>
      <h2>Topology Digest</h2>
      <p>{`nodes=${runbook.nodes.length}`}</p>
      <p>{`links=${links}`}</p>
      <h3>Phases</h3>
      <ul>
        {Object.entries(nodeGroups).map(([phase, total]) => (
          <li key={phase}>
            {phase}: {total}
          </li>
        ))}
      </ul>
      <h3>Severity</h3>
      <ul>
        {Object.entries(severityGroups).map(([severity, total]) => (
          <li key={severity}>
            {severity}: {total}
          </li>
        ))}
      </ul>
      <h3>Status</h3>
      <ul>
        {Object.entries(statusGroups).map(([status, total]) => (
          <li key={status}>
            {status}: {total}
          </li>
        ))}
      </ul>
    </section>
  );
};
