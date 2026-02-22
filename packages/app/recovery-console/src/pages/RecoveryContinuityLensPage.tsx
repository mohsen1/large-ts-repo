import { useMemo } from 'react';
import { useRecoveryContinuityLensControl } from '../hooks/useRecoveryContinuityLensControl';
import { ContinuityLensTimeline } from '../components/ContinuityLensTimeline';
import { ContinuityLensRiskBoard } from '../components/ContinuityLensRiskBoard';
import { ContinuityLensDependencyStrip } from '../components/ContinuityLensDependencyStrip';

interface RecoveryContinuityLensPageProps {
  readonly tenantId: string;
}

export const RecoveryContinuityLensPage = ({ tenantId }: RecoveryContinuityLensPageProps) => {
  const lens = useRecoveryContinuityLensControl(tenantId);
  const selectedPolicyNames = useMemo(() => lens.enabledPolicyNames.join(', '), [lens.enabledPolicyNames]);

  return (
    <main>
      <header>
        <h1>Continuity lens operations</h1>
        <p>Tenant: {lens.tenantId}</p>
        <p>Mode: {lens.mode}</p>
        <p>Policy: {lens.activePolicy.name} · threshold {lens.activePolicy.minimumSeverity}</p>
      </header>

      <section>
        <button type="button" onClick={() => void lens.ingestSeedSignals()} disabled={lens.running}>
          Ingest seeded signals
        </button>
        <button type="button" onClick={() => void lens.refreshWorkspace()} disabled={lens.running}>
          Refresh workspace
        </button>
        <button type="button" onClick={lens.clearSignals} disabled={lens.running}>
          Clear workspace
        </button>
        <label>
          Policy
          <select
            value={lens.activePolicy.name}
            onChange={(event) => {
              lens.switchPolicy(event.target.value);
            }}
          >
            {lens.enabledPolicyNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mode
          <select value={lens.mode} onChange={(event) => lens.setMode(event.target.value as 'auto' | 'manual')}>
            <option value="auto">auto</option>
            <option value="manual">manual</option>
          </select>
        </label>
      </section>

      {lens.error && <p>{lens.error}</p>}
      <p>Signals loaded: {lens.signalCount}</p>
      <p>Forecast trend: {lens.forecastTrend ?? 'not run'}</p>
      <p>Policies: {selectedPolicyNames}</p>
      <p>Summary: {lens.summary ? `${Math.round(lens.summary.riskScore)} risk score` : 'pending workspace sync'}</p>

      <ContinuityLensRiskBoard workspace={lens.workspace} onForecast={lens.forecast} />
      <ContinuityLensTimeline workspace={lens.workspace} />
      <ContinuityLensDependencyStrip workspace={lens.workspace} />
    </main>
  );
};
