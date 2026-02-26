import { useMemo } from 'react';
import { executeSagaWorkflow } from '@shared/type-level/stress-controlflow-saga-graph';
import { evaluateLogicalOrbit } from '@shared/type-level/stress-binary-expression-orbit';
import { buildClassLeaf, consumeDeepSpanChain, type DeepSpanChain } from '@shared/type-level/stress-deep-hierarchy-radar';
import { useTypeSolverStressLab } from '../../hooks/useTypeSolverStressLab';

type MatrixRow = {
  readonly signal: string;
  readonly score: number;
  readonly accepted: boolean;
  readonly detail: string;
};

export const TypeSolverDecisionMatrix = () => {
  const { seed } = useTypeSolverStressLab();
  const chain = buildClassLeaf();
  const deepSpan = useMemo<DeepSpanChain>(() => {
    return {
      anchor: true,
      stageOne: 1,
      stageTwo: 2,
      stageThree: 3,
      stageFour: 4,
      stageFive: 5,
      stageSix: 6,
      stageSeven: 7,
      stageEight: 8,
      stageNine: 9,
      stageTen: 10,
      stageEleven: 11,
      stageTwelve: 12,
      stageThirteen: 13,
      stageFourteen: 14,
      stageFifteen: 15,
      stageSixteen: 16,
      stageSeventeen: 17,
      stageEighteen: 18,
      stageNineteen: 19,
      stageTwenty: 20,
      stageTwentyOne: 21,
      stageTwentyTwo: 22,
      stageTwentyThree: 23,
      stageTwentyFour: 24,
      stageTwentyFive: 25,
      stageTwentySix: 26,
      stageTwentySeven: 27,
      stageTwentyEight: 28,
      stageTwentyNine: 29,
      stageThirty: 30,
      stageThirtyOne: 31,
      stageThirtyTwo: 32,
      stageThirtyThree: 33,
      stageThirtyFour: 34,
      stageThirtyFive: 35,
      stageThirtySix: 36,
      stageThirtySeven: 37,
      stageThirtyEight: 38,
      stageThirtyNine: 39,
      stageForty: 40,
    };
  }, []);

  const matrix = useMemo<MatrixRow[]>(() => {
    const outcomes = executeSagaWorkflow({ tenant: seed.tenant, score: seed.score });
    return outcomes.map((outcome, index) => {
      const score = evaluateLogicalOrbit({
        fast: index % 2 === 0,
        secure: seed.score >= 20,
        stable: !outcome.kind.includes('hold'),
        remote: index % 3 === 0,
        active: outcome.next !== null,
        count: (index % 10) as 0,
        priority: (index + seed.score) % 10 as 0,
      });
      return {
        signal: outcome.detail,
        score,
        accepted: outcome.kind === 'complete',
        detail: outcome.next ?? 'terminal',
      };
    });
  }, [seed.score, seed.tenant]);

  const chainSize = consumeDeepSpanChain(deepSpan);
  const depth = chainSize + Object.keys(chain).length;

  return (
    <section className="type-solver-decision-matrix">
      <h3>Type Solver Decision Matrix</h3>
      <p>
        Chain markers: {depth} · Anchor depth: {chain.depth}
      </p>
      <table>
        <thead>
          <tr>
            <th>Signal</th>
            <th>Score</th>
            <th>Accepted</th>
            <th>Next</th>
          </tr>
        </thead>
        <tbody>
          {matrix.map((row) => (
            <tr key={`${row.signal}-${row.score}`}>
              <td>{row.signal}</td>
              <td>{row.score}</td>
              <td>{row.accepted ? 'yes' : 'no'}</td>
              <td>{row.detail}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <section>
        <h4>Depth Validation</h4>
        <ul>
          <li>Chain fields: {Object.keys(deepSpan).length}</li>
          <li>Class depth: {chain.depth}</li>
          <li>Class id: {chain.id}</li>
          <li>Namespace: {chain.namespace}</li>
        </ul>
      </section>
    </section>
  );
};
