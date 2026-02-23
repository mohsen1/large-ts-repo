import { useEffect, useMemo, useState } from 'react';
import { ThroughputForecast, forecastThroughput, ThroughputRecord } from '@domain/streaming-observability';

export interface ForecastState {
  loading: boolean;
  error: string | null;
  forecast: ThroughputForecast | null;
  samplesUsed: number;
}

export const useStreamForecast = (streamId: string, history: ThroughputRecord[]) => {
  const [state, setState] = useState<ForecastState>({
    loading: true,
    error: null,
    forecast: null,
    samplesUsed: 0,
  });

  const filtered = useMemo(() => history.slice(-20), [history]);

  useEffect(() => {
    setState((current) => ({ ...current, loading: true, error: null }));
    try {
      const forecast = forecastThroughput({
        streamId,
        history: filtered,
        targetWindowMs: 120000,
      });
      setState({
        loading: false,
        error: null,
        forecast,
        samplesUsed: filtered.length,
      });
    } catch (error) {
      setState({
        loading: false,
        error: String(error instanceof Error ? error.message : error),
        forecast: null,
        samplesUsed: filtered.length,
      });
    }
  }, [streamId, filtered]);

  return state;
};
