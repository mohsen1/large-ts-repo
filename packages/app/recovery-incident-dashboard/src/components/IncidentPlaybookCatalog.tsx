import { useMemo, useState } from 'react';
import type { PortfolioPlan } from '@domain/recovery-incident-orchestration';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { RecoveryPlaybookOrchestrator } from '@service/recovery-incident-orchestrator';

export interface IncidentPlaybookCatalogProps {
  readonly repository: RecoveryIncidentRepository;
  readonly tenantId: string;
}

type CatalogMode = 'idle' | 'loading' | 'ready' | 'error';

export const IncidentPlaybookCatalog = ({ repository, tenantId }: IncidentPlaybookCatalogProps) => {
  const [mode, setMode] = useState<CatalogMode>('idle');
  const [plan, setPlan] = useState<PortfolioPlan | undefined>(undefined);
  const [message, setMessage] = useState<string>('');
  const orchestrator = useMemo(
    () => new RecoveryPlaybookOrchestrator(repository, {
      tenantId,
      maxCandidates: 20,
      requireOwnerApproval: true,
    }),
    [repository, tenantId],
  );

  const refresh = async (): Promise<void> => {
    setMode('loading');
    setMessage('');
    try {
      const data = await orchestrator.buildPortfolioFromRepository({
        tenantId,
        maxPerIncident: 4,
        includeOnlyTagged: false,
        minSeverity: ['low', 'medium', 'high', 'critical', 'extreme'],
      });
      setPlan(data);
      setMode('ready');
    } catch (error) {
      setMode('error');
      setMessage(error instanceof Error ? error.message : 'Could not load portfolio');
    }
  };

  const totalSlots = plan?.slots.length ?? 0;
  const selectedCount = plan?.slots.filter((slot) => slot.selectedTemplateId).length ?? 0;
  const totalCandidates = useMemo(
    () => plan?.slots.reduce((acc, slot) => acc + slot.candidates.length, 0) ?? 0,
    [plan],
  );
  const topSlots = (plan?.slots ?? []).slice(0, 8);

  return (
    <section className="incident-playbook-catalog">
      <header>
        <h2>Playbook Catalog</h2>
        <p>Tenant: {tenantId}</p>
        <button type="button" onClick={() => void refresh()}>
          Build portfolio
        </button>
      </header>

      <div className="playbook-kpi">
        <article>
          <h3>Mode</h3>
          <strong>{mode}</strong>
        </article>
        <article>
          <h3>Slots</h3>
          <strong>{totalSlots}</strong>
        </article>
        <article>
          <h3>Selected</h3>
          <strong>{selectedCount}</strong>
        </article>
        <article>
          <h3>Candidates</h3>
          <strong>{totalCandidates}</strong>
        </article>
      </div>

      {message ? <p className="playbook-message">{message}</p> : null}

      <div className="slot-grid">
        {topSlots.map((slot) => {
          const selected = slot.selectedTemplateId ? String(slot.selectedTemplateId) : 'none';
          return (
            <article key={String(slot.incidentId)} className="slot-card">
              <h4>{slot.scope.serviceName}</h4>
              <p>Incident: {String(slot.incidentId)}</p>
              <p>Candidates: {slot.candidates.length}</p>
              <p>Selected: {selected}</p>
            </article>
          );
        })}
      </div>

      {mode === 'loading' ? <p>Loading playbook portfolio…</p> : null}
    </section>
  );
};
