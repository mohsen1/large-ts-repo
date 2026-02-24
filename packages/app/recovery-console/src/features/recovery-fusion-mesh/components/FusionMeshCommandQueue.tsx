import type { MeshOrchestrationOutput } from '@service/recovery-fabric-controller';

interface FusionMeshCommandQueueProps {
  readonly output: MeshOrchestrationOutput | null;
}

export const FusionMeshCommandQueue = ({ output }: FusionMeshCommandQueueProps) => {
  if (!output) {
    return (
      <section className="fusion-mesh-command-queue">
        <h3>Command Queue</h3>
        <p>No commands executed yet.</p>
      </section>
    );
  }

  const commandRows = output.commandIds.map((commandId) => <li key={commandId}>{commandId}</li>);
  return (
    <section className="fusion-mesh-command-queue">
      <h3>Command Queue</h3>
      <p>Run: {output.runId}</p>
      <p>Status: {output.status}</p>
      <p>Waves: {output.waves.length}</p>
      <ul>{commandRows}</ul>
    </section>
  );
};
