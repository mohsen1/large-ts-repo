import { useEffect, useRef } from 'react';
import type { QuantumPlan } from '@domain/recovery-quantum-orchestration';

interface Props {
  readonly plan?: QuantumPlan;
}

const toBars = (steps: number, max = 32): readonly string[] =>
  Array.from({ length: Math.min(steps, max) }, (_, index) => '▮');

export const QuantumTimeline = ({ plan }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const bars = toBars(plan?.steps.length ?? 0);
  const elapsed =
    plan
      ? new Date(plan.updatedAt).getTime() - new Date(plan.createdAt).getTime()
      : 0;

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }
    if (bars.length === 0) {
      node.textContent = 'No steps';
      return;
    }
    node.textContent = `${bars.length} steps; elapsed=${elapsed}ms`;
  }, [bars.length, elapsed]);

  return (
    <section className="quantum-timeline">
      <header>
        <h3>Plan timeline</h3>
      </header>
      <p>
        Plan: {plan?.id ?? 'unknown'} · State: {plan?.state ?? 'empty'} · Steps: {plan?.steps.length ?? 0}
      </p>
      <div ref={ref} aria-live="polite">
        {plan ? <span>{bars.join('')}</span> : <span>Initialize a plan</span>}
      </div>
    </section>
  );
};
