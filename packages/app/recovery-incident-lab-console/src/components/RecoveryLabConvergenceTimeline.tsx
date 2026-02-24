import { type ReactElement } from 'react';
import { useMemo } from 'react';
import type { ConvergenceOutput } from '@domain/recovery-lab-orchestration-core';

interface Props {
  readonly output: ConvergenceOutput | null;
  readonly onJumpToStage?: (stage: string) => void;
}

interface Node {
  readonly id: string;
  readonly label: string;
  readonly value: number;
}

const asNodes = (output: ConvergenceOutput | null): readonly Node[] => {
  if (!output) {
    return [];
  }

  return [
    { id: 'score', label: `score:${output.score}`, value: output.score },
    { id: 'confidence', label: `confidence:${output.confidence}`, value: output.confidence },
    ...output.diagnostics.slice(0, 6).map((diagnostic, index) => ({
      id: `${index}-${diagnostic}`,
      label: diagnostic,
      value: 1 / Math.max(1, index + 1),
    })),
  ];
};

export const RecoveryLabConvergenceTimeline = ({ output, onJumpToStage }: Props): ReactElement => {
  const nodes = useMemo(() => asNodes(output), [output]);
  const total = useMemo(() => nodes.reduce((sum, node) => sum + node.value, 0), [nodes]);
  const ordered = useMemo(() => nodes.toSorted((left, right) => right.value - left.value), [nodes]);

  return (
    <section className="recovery-lab-convergence-timeline">
      <h2>Convergence timeline</h2>
      <p>stage nodes: {nodes.length}</p>
      <p>total score: {total.toFixed(3)}</p>
      <ul>
        {ordered.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              onClick={() => {
                onJumpToStage?.(node.id);
              }}
            >
              {node.label}:{node.value.toFixed(3)}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
};
