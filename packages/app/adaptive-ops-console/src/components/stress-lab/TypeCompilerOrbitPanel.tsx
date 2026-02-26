import { useMemo } from 'react';
import { buildOrbitRuntime, orbitSteps, orbitRuntimes, orbitTrace, type OrbitStep } from '@domain/recovery-lab-synthetic-orchestration';
import { compileControlBranch, routeBranchDiagnostics as routeBranchDigest } from '@domain/recovery-lab-synthetic-orchestration';

type RuntimeStep = OrbitStep;

const buildModeLabel = (step: RuntimeStep): string => `${step.mode} · ${step.route}`;

export const TypeCompilerOrbitPanel = () => {
  const modeCounts = useMemo(() => {
    const bucket = new Map<string, number>();
    for (const step of orbitSteps) {
      const previous = bucket.get(step.mode) ?? 0;
      bucket.set(step.mode, previous + 1);
    }
    return [...bucket.entries()].map(([mode, count]) => ({ mode, count }));
  }, []);

  const traces = useMemo(() => {
    const records = orbitTrace.map((entry, index) => ({
      trace: `${index + 1}: ${entry.decision.branch}`,
      route: entry.envelope.routeId,
      score: entry.decision.score,
    }));
    return records.slice(0, 12);
  }, []);

  const runtimes = useMemo(() => {
    const runtime = buildOrbitRuntime(orbitRuntimes[0].queue, 'observe');
    return runtime.invocationLog
      .map((invocation, index) => {
        const typedInvocation = invocation as { readonly output?: { readonly route?: string } };
        const route = runtime.queue[index % runtime.queue.length] ?? '/incident/discover/high/R-00';
        return {
          route,
          invocation: `${index + 1}:${typedInvocation.output?.route}`,
        };
      })
      .slice(0, 5);
  }, []);

  return (
    <section className="type-compiler-orbit-panel">
      <h3>Orbit Runtime</h3>
      <div>
        <h4>Mode Histogram</h4>
        <ul>
          {modeCounts.map((entry) => (
            <li key={entry.mode}>
              {entry.mode}: {entry.count}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4>Step Trace</h4>
        <ul>
          {orbitSteps.map((step) => (
            <li key={buildModeLabel(step)}>{buildModeLabel(step)}</li>
          ))}
        </ul>
      </div>
      <div>
        <h4>Trace Decisions</h4>
        <ul>
          {traces.map((entry) => (
            <li key={entry.route}>
              {entry.trace} · {entry.score}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4>Invocations</h4>
        <ul>
          {runtimes.map((entry) => (
            <li key={entry.invocation}>{entry.route}</li>
          ))}
        </ul>
      </div>
      <pre>{JSON.stringify(compileControlBranch('/incident/discover/high/R-100'), null, 2)}</pre>
      <pre>{JSON.stringify(routeBranchDigest, null, 2)}</pre>
    </section>
  );
};
