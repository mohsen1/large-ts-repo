import { memo } from 'react';
import type { StressTypeCommandRow } from '../types/stressTypeLabSchema';
import { useTypeTemplateSolver } from '../hooks/useTypeTemplateSolver';

const routeSignature = (route: StressTypeCommandRow['route']) =>
  route
    .map((entry) => `${entry[0]}|${entry[1]}`)
    .sort()
    .join('::');

const SeverityLegend = ({ severity }: { readonly severity: StressTypeCommandRow['severity'] }) => {
  if (severity >= 8) {
    return <span>Critical</span>;
  }
  if (severity >= 6) {
    return <span>High</span>;
  }
  if (severity >= 4) {
    return <span>Medium</span>;
  }
  return <span>Low</span>;
};

const DomainPill = ({ name, active }: { readonly name: string; readonly active: boolean }) => {
  const tone = active ? 'green' : 'gray';
  return <span style={{ marginRight: 8, color: tone }}>{name}</span>;
};

export const StressTypeLabInspector = (props: { readonly commands: readonly StressTypeCommandRow[] }) => {
  const solver = useTypeTemplateSolver(['explore', 'simulate', 'validate', 'audit', 'stress', 'graph']);

  const signatures = props.commands
    .map((entry) => routeSignature(entry.route))
    .filter((entry, index) => index % 2 === 0);

  const projections = signatures.map((signature) => {
    const entry = props.commands.find((candidate) => routeSignature(candidate.route) === signature);
    return {
      signature,
      routeParts: signature.split('::'),
      tags: entry ? [...new Set(entry.route.flatMap((route) => route))] : [],
    };
  });

  return (
    <section>
      <h3>Template Inspector</h3>
      <p>Projection count: {projections.length}</p>
      <ul>
        {projections.map((projection) => {
          const projectedSeverity = ((projection.tags.length % 9) + 1) as StressTypeCommandRow['severity'];
          const first = projection.routeParts[0]?.split('|') ?? ['unknown'];
          const second = projection.routeParts[1]?.split('|') ?? ['unknown'];
          const firstDomain = first[0] ?? 'unknown';
          const secondDomain = second[0] ?? 'unknown';
          return (
            <li key={projection.signature}>
              <div>
                <DomainPill name={firstDomain} active />
                <DomainPill name={secondDomain} active={projection.tags.length > 0} />
              </div>
              <div>
                {projection.tags.map((tag) => (
                  <span style={{ marginRight: 4 }} key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
              <div>
                {projection.routeParts.map((part, index) => (
                  <div key={`${part}-${index}`}>{part}</div>
                ))}
              </div>
              <div>
                <strong>severity: </strong>
                <SeverityLegend severity={projectedSeverity} />
                <span style={{ marginLeft: 8 }}>{solver.modeSet.has('simulate') ? 'sim' : 'std'}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
