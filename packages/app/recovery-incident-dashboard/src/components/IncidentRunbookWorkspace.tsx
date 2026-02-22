import { useCallback, useMemo, useState } from 'react';
import type { PortfolioPlan, PortfolioSlot, IncidentId } from '@domain/recovery-incident-orchestration';
import type { RecoveryIncidentRepository } from '@data/recovery-incident-store';
import { RecoveryPlaybookOrchestrator } from '@service/recovery-incident-orchestrator';

export interface IncidentRunbookWorkspaceProps {
  readonly repository: RecoveryIncidentRepository;
  readonly tenantId: string;
}

interface SlotRowProps {
  readonly slot: PortfolioSlot;
  readonly isExpanded: boolean;
  readonly onToggle: () => void;
}

interface SimInputState {
  readonly templateSeed: string;
  readonly limit: number;
}

export const IncidentRunbookWorkspace = ({ repository, tenantId }: IncidentRunbookWorkspaceProps) => {
  const orchestrator = useMemo(
    () => new RecoveryPlaybookOrchestrator(repository, {
      tenantId,
      maxCandidates: 24,
      requireOwnerApproval: false,
    }),
    [tenantId, repository],
  );

  const [portfolio, setPortfolio] = useState<PortfolioPlan | undefined>(undefined);
  const [expandedIncident, setExpandedIncident] = useState<string>('');
  const [simulation, setSimulation] = useState<SimInputState>({ templateSeed: '', limit: 25 });
  const [simulationMessage, setSimulationMessage] = useState<string>('');

  const refresh = useCallback(async () => {
    const next = await orchestrator.buildPortfolioFromRepository({
      tenantId,
      maxPerIncident: 6,
      includeOnlyTagged: false,
      minSeverity: ['low', 'medium', 'high', 'critical', 'extreme'],
    });
    setPortfolio(next);
  }, [orchestrator, tenantId]);

  const runSimulation = useCallback(async () => {
    const result = await orchestrator.simulatePlaybookRun(
      expandedIncident as unknown as IncidentId,
      {
        tenantId,
        templateSeed: simulation.templateSeed,
        limit: simulation.limit,
      },
    );
    const prefix = result.ok ? 'ok' : 'blocked';
    setSimulationMessage(`${prefix}: commands=${result.estimatedCommands} mins=${result.estimatedMinutes} issues=${result.issueCount}`);
  }, [expandedIncident, orchestrator, simulation.limit, simulation.templateSeed, tenantId]);

  const selectedIncident = useMemo(
    () => portfolio?.slots.find((slot) => String(slot.incidentId) === expandedIncident),
    [expandedIncident, portfolio],
  );

  return (
    <section className="incident-runbook-workspace">
      <header>
        <h2>Runbook Workspace</h2>
        <button type="button" onClick={() => void refresh()}>
          Refresh portfolio
        </button>
      </header>

      <p>tenant={tenantId}</p>
      <p>slots={portfolio?.slots.length ?? 0}</p>
      <p>selected={portfolio?.slots.filter((slot) => slot.selectedTemplateId).length ?? 0}</p>

      <div className="workspace-layout">
        <section>
          <h3>Portfolio</h3>
          {portfolio?.slots.map((slot) => (
            <SlotRow
              key={String(slot.incidentId)}
              slot={slot}
              isExpanded={String(slot.incidentId) === expandedIncident}
              onToggle={() => {
                const next = String(slot.incidentId);
                setExpandedIncident((current) => (current === next ? '' : next));
              }}
            />
          ))}
        </section>

        <section>
          <h3>Simulation Input</h3>
          <label>
            Template seed
            <input
              type="text"
              value={simulation.templateSeed}
              onChange={(event) => setSimulation((previous) => ({
                ...previous,
                templateSeed: event.currentTarget.value,
              }))}
            />
          </label>
          <label>
            Limit
            <input
              type="number"
              min={1}
              max={120}
              value={simulation.limit}
              onChange={(event) => setSimulation((previous) => ({
                ...previous,
                limit: Number(event.currentTarget.value),
              }))}
            />
          </label>
          <button type="button" onClick={() => void runSimulation()}>
            Run simulation
          </button>
          <p>{simulationMessage}</p>
        </section>
      </div>

      {selectedIncident ? (
        <section>
          <h3>Selected Incident</h3>
          <p>service={selectedIncident.scope.serviceName}</p>
          <p>tenant={selectedIncident.scope.tenantId}</p>
          <p>region={selectedIncident.scope.region}</p>
          <p>candidateCount={selectedIncident.candidates.length}</p>
        </section>
      ) : null}
    </section>
  );
};

const SlotRow = ({ slot, isExpanded, onToggle }: SlotRowProps) => {
  const selectedTemplate = slot.selectedTemplateId ? String(slot.selectedTemplateId) : 'unassigned';
  return (
    <article className={isExpanded ? 'slot-row expanded' : 'slot-row'}>
      <header>
        <button type="button" onClick={onToggle}>
          {String(slot.incidentId)}
        </button>
      </header>
      <p>service={slot.scope.serviceName}</p>
      <p>tenant={slot.scope.tenantId}</p>
      <p>candidateCount={slot.candidates.length}</p>
      <p>selected={selectedTemplate}</p>
      {isExpanded ? (
        <ul>
          {slot.candidates.map((candidate) => (
            <li key={`${candidate.template.id}-candidate`}>
              {candidate.template.title} • score={candidate.priority}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
};
