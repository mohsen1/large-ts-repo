import { Fragment, useMemo } from 'react';
import type { ControlPlaneManifest } from '@domain/recovery-operations-control-plane';

interface ControlPlaneManifestPanelProps {
  readonly manifest: ControlPlaneManifest;
}

const percent = (value: number): string => `${Math.round(value * 100)}%`;

const buildTimeline = (
  manifest: ControlPlaneManifest,
): readonly { readonly at: string; readonly stage: string; readonly event: string; readonly tagCount: number }[] =>
  manifest.timeline.map((entry) => ({
    at: entry.at,
    stage: entry.stage,
    event: entry.event,
    tagCount: entry.tags.length,
  }));

export const ControlPlaneManifestPanel = ({ manifest }: ControlPlaneManifestPanelProps) => {
  const timeline = useMemo(() => buildTimeline(manifest), [manifest]);
  const completion = useMemo(() => {
    const staged = new Map<string, number>();
    for (const entry of manifest.timeline) {
      staged.set(entry.stage, (staged.get(entry.stage) ?? 0) + 1);
    }
    return [...staged.entries()].map(([stage, count]) => ({ stage, count, percent: percent(count / staged.size) }));
  }, [manifest]);

  return (
    <section className="control-plane-manifest-panel">
      <h3>Control plane manifest</h3>
      <dl>
        <div>
          <dt>Envelope</dt>
          <dd>{manifest.envelopeId}</dd>
        </div>
        <div>
          <dt>Tenant</dt>
          <dd>{manifest.tenant}</dd>
        </div>
        <div>
          <dt>Run</dt>
          <dd>{manifest.run}</dd>
        </div>
        <div>
          <dt>Commands</dt>
          <dd>{manifest.plan.commands.length}</dd>
        </div>
        <div>
          <dt>Checkpoints</dt>
          <dd>{manifest.checkpoints.length}</dd>
        </div>
      </dl>

      <h4>Stage completion</h4>
      <ul>
        {completion.map((entry) => (
          <li key={entry.stage}>
            {entry.stage}: {entry.count} ({entry.percent})
          </li>
        ))}
      </ul>

      <h4>Timeline</h4>
      <div className="control-plane-timeline">
        {timeline.map((entry) => (
          <Fragment key={`${entry.at}-${entry.stage}`}>
            <div>{entry.at}</div>
            <div>{entry.stage}</div>
            <div>{entry.event}</div>
            <div>tags: {entry.tagCount}</div>
          </Fragment>
        ))}
      </div>
    </section>
  );
};
