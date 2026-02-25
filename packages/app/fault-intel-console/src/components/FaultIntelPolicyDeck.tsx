import type { CampaignRunResult } from '@domain/fault-intel-orchestration';

interface FaultIntelPolicyDeckProps {
  readonly run?: CampaignRunResult;
  readonly onRefresh: () => void;
}

interface PolicyRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export const FaultIntelPolicyDeck = ({ run, onRefresh }: FaultIntelPolicyDeckProps) => {
  const rows = (run?.policy
    ? ([
        { key: 'policyId', label: 'Policy', value: run.policy.policyId },
        { key: 'name', label: 'Name', value: run.policy.name },
        { key: 'description', label: 'Description', value: run.policy.description },
        { key: 'stages', label: 'Stages', value: run.policy.requiredStages.join(', ') },
        { key: 'transports', label: 'Transports', value: run.policy.requiredTransports.join(', ') },
      ] as PolicyRow[])
    : [{ key: 'empty', label: 'Policy', value: 'No policy selected yet' }]);

  return (
    <section style={{ border: '1px solid #7c3aed', borderRadius: 12, padding: 12, background: '#1e1b4b', color: '#e0e7ff' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0 }}>Policy deck</h3>
        <button type="button" onClick={onRefresh} style={{ borderRadius: 999, padding: '6px 10px', border: '1px solid #a78bfa' }}>
          Refresh policy
        </button>
      </header>
      <dl style={{ margin: 0, marginTop: 12 }}>
        {rows.map((row) => (
          <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8, padding: '4px 0' }}>
            <dt style={{ opacity: 0.8 }}>{row.label}</dt>
            <dd style={{ margin: 0 }}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};
