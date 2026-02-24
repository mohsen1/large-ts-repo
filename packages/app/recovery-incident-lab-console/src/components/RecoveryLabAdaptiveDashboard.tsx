import { type ReactElement, useMemo } from 'react';
import {
  calculateSignalHealth,
  buildPlanCoverage,
  summarizeAdaptiveResult,
} from '../services/recoveryLabAdaptiveAutomationService';
import type { CampaignDiagnostic, CampaignPlan, CampaignRunResult, CampaignSnapshot } from '@domain/recovery-lab-adaptive-orchestration';
import type { AdaptiveRunResponse } from '../services/recoveryLabAdaptiveAutomationService';

interface SnapshotGroup {
  readonly campaignId: string;
  readonly stage: string;
  readonly size: number;
}

interface Props {
  readonly response?: AdaptiveRunResponse<Record<string, unknown>>;
  readonly plan?: CampaignPlan;
  readonly run?: CampaignRunResult;
  readonly snapshots: readonly CampaignSnapshot[];
  readonly diagnostics: readonly CampaignDiagnostic[];
}

const SnapshotList = ({ snapshots }: { readonly snapshots: readonly CampaignSnapshot[] }): ReactElement => {
  const groups = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.campaignId}:${snapshot.stage}`;
      grouped.set(key, (grouped.get(key) ?? 0) + 1);
    }
    return [...grouped.entries()].map(([key, size]) => {
      const [campaignId, stage] = key.split(':');
      return {
        campaignId,
        stage,
        size,
      } as SnapshotGroup;
    });
  }, [snapshots]);

  return (
    <section className="adaptive-snapshot-list">
      <h3>Snapshots ({snapshots.length})</h3>
      <ul>
        {groups.map((entry) => (
          <li key={`${entry.campaignId}-${entry.stage}`}>
            {entry.campaignId} / {entry.stage}: {entry.size}
          </li>
        ))}
      </ul>
    </section>
  );
};

const DiagnosticsList = ({ diagnostics }: { readonly diagnostics: readonly CampaignDiagnostic[] }): ReactElement => {
  const bucket = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of diagnostics) {
      const key = `${item.phase}:${item.source}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [diagnostics]);

  return (
    <section className="adaptive-diagnostics">
      <h3>Diagnostics ({diagnostics.length})</h3>
      <div>
        <p>{bucket.length ? bucket[0]?.[0] : 'none'}</p>
      </div>
      <ul>
        {bucket.map(([entry, count]) => (
          <li key={entry}>
            {entry}: {count}
          </li>
        ))}
      </ul>
    </section>
  );
};

const HealthPanel = ({ run }: { readonly run?: CampaignRunResult }): ReactElement => {
  const health = run ? calculateSignalHealth(run) : 0;
  const color = health >= 75 ? 'green' : health >= 50 ? 'gold' : 'red';
  return (
    <section className="adaptive-health">
      <h3>Health</h3>
      <p style={{ color }}>{health}</p>
      <progress value={health} max={100} />
      <small>{run ? run.runId : 'no run'}</small>
    </section>
  );
};

const CoveragePanel = ({ plan }: { readonly plan?: CampaignPlan }): ReactElement => {
  const coverage = useMemo(() => (plan ? buildPlanCoverage(plan) : undefined), [plan]);
  const entries = useMemo(() => Object.entries(coverage ?? {}), [coverage]);

  return (
    <section className="adaptive-plan-coverage">
      <h3>Plan coverage</h3>
      <ul>
        {entries.map(([key, value]) => (
          <li key={key}>
            {key}: {String(value)}
          </li>
        ))}
        {!plan && <li>no active plan</li>}
      </ul>
    </section>
  );
};

const SummaryPanel = ({ response }: { readonly response?: AdaptiveRunResponse<Record<string, unknown>> }): ReactElement => {
  const text = useMemo(() => (response ? summarizeAdaptiveResult(response) : 'no summary'), [response]);
  return (
    <section className="adaptive-summary">
      <h3>Summary</h3>
      <pre>{text}</pre>
    </section>
  );
};

export const RecoveryLabAdaptiveDashboard = ({ response, plan, run, snapshots, diagnostics }: Props): ReactElement => {
  const phaseOrder = ['ingest', 'plan', 'execute', 'verify', 'synthesize'];
  const phaseMap = useMemo(() => {
    const output: Record<string, number> = {};
    for (const phase of phaseOrder) {
      output[phase] = diagnostics.filter((item) => item.phase === phase).length;
    }
    return output;
  }, [diagnostics]);

  return (
    <article className="adaptive-dashboard">
      <header>
        <h2>Adaptive Lab Orchestration</h2>
      </header>

      <SummaryPanel response={response} />

      <section className="adaptive-phases">
        <h3>Phase coverage</h3>
        <ul>
          {phaseOrder.map((phase) => (
            <li key={phase}>
              {phase}: {phaseMap[phase]}
            </li>
          ))}
        </ul>
      </section>

      <div className="adaptive-grid">
        <CoveragePanel plan={plan} />
        <HealthPanel run={run} />
      </div>

      <SnapshotList snapshots={snapshots} />
      <DiagnosticsList diagnostics={diagnostics} />
    </article>
  );
};
