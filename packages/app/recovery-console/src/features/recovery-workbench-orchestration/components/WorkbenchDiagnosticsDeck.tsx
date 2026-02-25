import { memo, type ReactElement } from 'react';
import type { WorkbenchPluginResult } from '../types';

interface WorkbenchDiagnosticsDeckProps {
  readonly results: readonly WorkbenchPluginResult[];
}

export const WorkbenchDiagnosticsDeck = memo(function WorkbenchDiagnosticsDeck({
  results,
}: WorkbenchDiagnosticsDeckProps): ReactElement {
  if (results.length === 0) {
    return (
      <section>
        <h3>Diagnostics</h3>
        <p>No plugin outputs yet.</p>
      </section>
    );
  }

  const sorted = [...results].sort((left, right) => right.confidence - left.confidence);

  return (
    <section>
      <h3>Diagnostics</h3>
      <table>
        <thead>
          <tr>
            <th>Plugin</th>
            <th>Route</th>
            <th>Value</th>
            <th>Confidence</th>
            <th>Latency</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((result) => (
            <tr key={result.id}>
              <td>{result.name}</td>
              <td>{result.route}</td>
              <td>{result.value}</td>
              <td>{result.confidence.toFixed(2)}</td>
              <td>{`${result.latencyMs}ms`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
});
