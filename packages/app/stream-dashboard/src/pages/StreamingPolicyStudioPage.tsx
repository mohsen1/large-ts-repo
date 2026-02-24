import { useCallback, useMemo, useState } from 'react';
import { StreamingPolicyPanel } from '../components/StreamingPolicyPanel';
import { TopologyControlPanel } from '../components/TopologyControlPanel';
import { PluginRegistryPanel } from '../components/PluginRegistryPanel';
import { useStreamingPolicyEngine } from '../hooks/useStreamingPolicyEngine';
import { ControlMode, STREAMING_POLICY_PLUGIN_STACK } from '@service/streaming-control';
import { StreamEventRecord } from '@domain/streaming-observability';

const generateEvents = (streamId: string): StreamEventRecord[] => [
  {
    tenant: 'tenant-main',
    streamId,
    eventType: 'lag-rise',
    latencyMs: 36,
    sampleAt: new Date().toISOString(),
    metadata: { generatedBy: 'policy-studio' },
    severity: 4,
    eventId: `${streamId}-policy-1`,
  },
  {
    tenant: 'tenant-main',
    streamId,
    eventType: 'lag-drop',
    latencyMs: 11,
    sampleAt: new Date().toISOString(),
    metadata: { generatedBy: 'policy-studio' },
    severity: 1,
    eventId: `${streamId}-policy-2`,
  },
];

const defaultModes: ControlMode[] = ['adaptive', 'conservative', 'strict'];

export const StreamingPolicyStudioPage = () => {
  const tenant = 'tenant-main';
  const streamId = 'policy-engine-stream';
  const {
    state,
    runPolicy,
    runReadOnly,
    metrics,
  } = useStreamingPolicyEngine({ tenant, streamId }, streamId);
  const [selectedPlugin, setSelectedPlugin] = useState<string>(STREAMING_POLICY_PLUGIN_STACK[0].name);
  const [mode, setMode] = useState<ControlMode>('adaptive');
  const [applied, setApplied] = useState<boolean>(false);

  const selectedPluginKind = useMemo(() =>
    STREAMING_POLICY_PLUGIN_STACK.find((plugin) => plugin.name === selectedPlugin)?.kind ?? STREAMING_POLICY_PLUGIN_STACK[0].kind
  , [selectedPlugin]);

  const run = useCallback(() => {
    void runPolicy(generateEvents(streamId), mode).then((result) => {
      if (result) setApplied(true);
    });
  }, [mode, runPolicy, streamId]);

  return (
    <main>
      <h1>Streaming Policy Studio</h1>
      <section>
        <button type="button" onClick={() => void runReadOnly()}>
          Load baseline snapshot
        </button>
        <button type="button" onClick={run}>
          Run policy mode {mode}
        </button>
        <button type="button" onClick={() => setMode((current) => current === 'adaptive' ? 'conservative' : current === 'conservative' ? 'strict' : 'adaptive')}>
          Cycle mode
        </button>
      </section>
      <section>
        <p>Loaded plugin: {selectedPlugin}</p>
        <p>Plugin kind: {selectedPluginKind}</p>
        <p>Critical signals: {metrics.warningCount}</p>
        <p>Critical alert: {String(metrics.isCritical)}</p>
        <p>Action density: {metrics.actionDensity}</p>
      </section>
      <PluginRegistryPanel pluginStack={STREAMING_POLICY_PLUGIN_STACK} selected={selectedPlugin} onSelect={setSelectedPlugin} />
      <StreamingPolicyPanel
        streamId={streamId}
        policyScale={state.policyScale}
        warnings={state.policyWarnings}
        actions={state.policyActions}
        mode={mode}
        onRefresh={() => void runReadOnly()}
      />
      <TopologyControlPanel streamId={streamId} actions={[]} />
      <p>
        Modes:
        {defaultModes.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setMode(value)}
            style={{ marginLeft: 8 }}
          >
            {value}
          </button>
        ))}
      </p>
      <p>Applied: {String(applied)}</p>
    </main>
  );
};
