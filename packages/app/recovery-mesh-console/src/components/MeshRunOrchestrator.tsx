import { useCallback, useMemo, useState } from 'react';
import { type EngineEnvelope, type MeshPayloadFor, type MeshRunId, type MeshSignalKind } from '@service/recovery-ops-mesh-engine';
import { useMeshSignalStream } from '../hooks/useMeshSignalStream';
import { MeshSignalPalette, SignalHistoryLegend } from './MeshSignalPalette';
import { MeshTimeline, type MeshTimelineProps } from './MeshTimeline';
import { MeshCommandDeck } from './MeshCommandDeck';
import { MeshTopologyGraph, MeshTopologyMiniCard } from './MeshTopologyGraph';
import { describeTopology, getRuntimeStats } from '../services/meshTopologyService';
import { catalogItemToCatalogPayload } from '../services/meshSignalCatalog';
import { withBrand } from '@shared/core';

export const MeshRunOrchestrator = () => {
  const stream = useMeshSignalStream();
  const [inputValue, setInputValue] = useState(1);
  const [history, setHistory] = useState<readonly MeshRunId[]>([]);

  const execute = useCallback(async () => {
    const normalized = Math.max(1, inputValue);
    await stream.send(stream.selected, normalized);
    const nextHistory = withBrand(`${stream.selected}-${normalized}`, 'MeshRunId');
    setHistory((current) => [nextHistory, ...current].slice(0, 24));
    setInputValue(normalized + 1);
  }, [inputValue, stream]);

  const topology = stream.topology;
  const stats = describeTopology(topology);
  const streamEvents = stream.events
    .map((event, index) => ({
      ...event,
      index,
    }))
    .toSorted((left, right) => right.when - left.when)
    .slice(0, 4);

  const commandSignal = useMemo<MeshPayloadFor<MeshSignalKind>>(() => {
    if (!stream.catalog?.items[0]) {
      return { kind: 'pulse', payload: { value: inputValue } };
    }
    return catalogItemToCatalogPayload(stream.catalog.items[0], inputValue);
  }, [inputValue, stream.catalog?.items]);

  const timelineProps = {
    topology,
    events: [] as unknown as MeshTimelineProps['events'],
  };

  const runtime = getRuntimeStats();

  return (
    <section>
      <MeshTopologyMiniCard topology={topology} />
      <MeshSignalPalette
        selected={stream.selected}
        onSelect={stream.select}
        mode={stream.catalog?.mode ?? 'single'}
        items={stream.catalog?.items ?? []}
        running={false}
      />

      <label>
        Value
        <input
          type="number"
          value={inputValue}
          onChange={(event) => {
            const next = Number(event.target.value);
            setInputValue(Number.isFinite(next) ? next : 1);
          }}
        />
      </label>

      <button type="button" onClick={execute}>
        Execute
      </button>

      <MeshCommandDeck
        signal={commandSignal}
        artifact={undefined}
        disabled={false}
        onRun={async () => execute()}
      />

      <MeshTimeline {...timelineProps} />

      <MeshTopologyGraph
        topology={topology}
        selectedKind={stream.selected}
        onNodeSelect={() => {
          return;
        }}
      />

      <h4>Runtime profile</h4>
      <p>{`nodes=${topology.nodes.length}, links=${topology.links.length}, queue=${stats.nodes}`}</p>
      <ul>
        {streamEvents.map((entry) => (
          <li key={`${entry.id}-${entry.index}`}>
            {entry.kind} {entry.when}
          </li>
        ))}
      </ul>
      <p>{`runtime maxBatch ${runtime.maxBatch}`}</p>

      <SignalHistoryLegend
        history={history}
        onSelect={(entry) => {
          setHistory((current) => current.filter((item) => item !== entry));
        }}
      />
    </section>
  );
};
