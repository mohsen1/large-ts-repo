import { memo, useMemo } from 'react';
import type { ReactNode } from 'react';

type Point = {
  readonly x: number;
  readonly y: number;
};

type Cell = {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly tone: string;
  readonly score: number;
};

type TopologyConfig = {
  readonly rows: number;
  readonly cols: number;
  readonly onSelect: (id: string) => void;
  readonly className?: string;
};

type TopologyBoard = {
  readonly cells: readonly Cell[];
  readonly summary: {
    readonly count: number;
    readonly average: number;
  };
};

const buildGrid = (rows: number, cols: number): readonly Cell[] => {
  const out: Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const index = row * cols + col;
      const tone = index % 3 === 0 ? '#1f78ff' : index % 3 === 1 ? '#a020f0' : '#10b981';
      out.push({
        id: `${row}:${col}`,
        x: col,
        y: row,
        tone,
        score: (index * 13) % 97,
      });
    }
  }
  return out;
};

const toPoint = (cell: Cell): Point => ({ x: cell.x, y: cell.y });
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

const cellEdges = (cells: readonly Cell[]): readonly { from: string; to: string; weight: number }[] => {
  const out: { from: string; to: string; weight: number }[] = [];
  for (let i = 0; i < cells.length; i += 1) {
    for (let j = i + 1; j < cells.length; j += 1) {
      const source = toPoint(cells[i]);
      const target = toPoint(cells[j]);
      const span = distance(source, target);
      if (span < 1.8) {
        out.push({ from: cells[i].id, to: cells[j].id, weight: span });
      }
    }
  }
  return out;
};

const renderCell = (cell: Cell, onSelect: TopologyConfig['onSelect']) => {
  const style = {
    left: `${cell.x * 72 + 8}px`,
    top: `${cell.y * 72 + 8}px`,
    width: 56,
    height: 56,
    background: `radial-gradient(circle at 30% 30%, ${cell.tone}, #041027)`,
    color: '#e2e8f0',
    borderRadius: 6,
    border: `1px solid ${cell.tone}`,
    position: 'absolute',
    display: 'grid',
    placeItems: 'center',
    fontFamily: 'IBM Plex Sans, system-ui, sans-serif',
    fontSize: 11,
    cursor: 'pointer',
    boxShadow: '0 6px 20px #02061766',
  } as const;
  return (
    <button
      key={cell.id}
      type="button"
      style={style}
      onClick={() => onSelect(cell.id)}
      title={`cell-${cell.id}`}
    >
      {cell.id}
      <span style={{ fontSize: 9, opacity: 0.8 }}>{cell.score}</span>
    </button>
  );
};

const renderEdgeLabel = (edge: { from: string; to: string; weight: number }, key: string): ReactNode => {
  const [fx, fy] = edge.from.split(':').map((item) => Number(item));
  const [tx, ty] = edge.to.split(':').map((item) => Number(item));
  const midX = (fx + tx) / 2;
  const midY = (fy + ty) / 2;
  return (
    <div
      key={key}
      style={{
        position: 'absolute',
        left: `${midX * 72 + 40}px`,
        top: `${midY * 72 + 32}px`,
        color: '#dbeafe',
        fontSize: 10,
      }}
    >
      {edge.weight.toFixed(2)}
    </div>
  );
};

export const StressHubTopologyCanvas = memo(({ rows, cols, onSelect, className = 'hub-topology' }: TopologyConfig) => {
  const board = useMemo<TopologyBoard>(() => {
    const cells = buildGrid(rows, cols);
    const links = cellEdges(cells);
    const average = cells.reduce((acc, cell) => acc + cell.score, 0) / cells.length;
    return {
      cells,
      summary: {
        count: cells.length,
        average: Math.round(average * 100) / 100,
      },
    } as const;
  }, [rows, cols]);

  const links = cellEdges(board.cells);

  return (
    <section className={className} style={{ position: 'relative', padding: 12, minHeight: 420 }}>
      <header
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          alignItems: 'center',
          marginBottom: 8,
          color: '#dbeafe',
          gap: 8,
        }}
      >
        <strong>Signal Topology Stress Grid</strong>
        <span>{`nodes: ${board.summary.count} · avg: ${board.summary.average}`}</span>
      </header>

      <div style={{ position: 'relative', width: 64 * cols + 24, height: 64 * rows + 24 }}>
        {board.cells.map((cell) => renderCell(cell, onSelect))}
        {links.map((edge) => renderEdgeLabel(edge, `${edge.from}-${edge.to}`))}
      </div>
    </section>
  );
});

StressHubTopologyCanvas.displayName = 'StressHubTopologyCanvas';
