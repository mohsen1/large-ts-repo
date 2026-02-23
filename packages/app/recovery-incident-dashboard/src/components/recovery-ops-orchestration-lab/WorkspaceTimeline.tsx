interface WorkspaceTimelineProps {
  readonly points: readonly { readonly timestamp: string; readonly label: string }[];
}

export const WorkspaceTimeline = ({ points }: WorkspaceTimelineProps) => {
  return (
    <section>
      <h3>Timeline</h3>
      <ol>
        {points.map((point) => (
          <li key={`${point.timestamp}-${point.label}`}>
            <time>{point.timestamp}</time> — {point.label}
          </li>
        ))}
      </ol>
    </section>
  );
};
