import { ReadinessLabRunner } from '../components/ReadinessLabRunner';

interface RecoveryReadinessLabOrchestratorPageProps {
  readonly tenant?: string;
}

const defaultNamespace = 'default';

export const RecoveryReadinessLabOrchestratorPage = ({ tenant = 'global-lab' }: RecoveryReadinessLabOrchestratorPageProps) => {
  return (
    <main>
      <header>
        <h1>Readiness Lab Orchestrator</h1>
        <p>{`tenant=${tenant} namespace=${defaultNamespace}`}</p>
      </header>
      <ReadinessLabRunner tenant={tenant} namespace={defaultNamespace} />
    </main>
  );
};
