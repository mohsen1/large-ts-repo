import { useMemo } from 'react';

interface FusionMeshSignalInspectorProps {
  readonly signalIds: readonly string[];
}

export const FusionMeshSignalInspector = ({ signalIds }: FusionMeshSignalInspectorProps) => {
  const counts = useMemo(() => signalIds.reduce<Record<string, number>>((acc, signalId) => {
    const [prefix, ...parts] = signalId.split(':');
    acc[prefix] = (acc[prefix] ?? 0) + 1;
    return acc;
  }, {}), [signalIds]);

  const buckets = useMemo(
    () =>
      Object.entries(counts)
        .sort(([, left], [, right]) => right - left)
        .map(([bucket, count]) => (
          <li key={bucket}>
            {bucket}: {count}
          </li>
        )),
    [counts],
  );

  return (
    <section className="fusion-mesh-signal-inspector">
      <h3>Signal Inspector</h3>
      <p>Latest: {signalIds.length}</p>
      <ul>{buckets}</ul>
    </section>
  );
};
